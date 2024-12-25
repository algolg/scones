import { Ipv4Address, Identifier, DeviceID, MacAddress } from "./addressing.js";
import { ArpPacket, ArpTable, OP } from "./arp.js";
import { ForwardingInformationBase } from "./forwarding.js";
import { EtherType, Frame } from "./frame.js";
import { IdentifiedList, InfMatrix, L2Interface, L3Interface } from "./interface.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./ip.js";
import { RoutingTable } from "./routing.js";

export interface IdentifiedItem {
    getId(): Identifier;
    compare(other: this): number;
}

export class Device implements IdentifiedItem {
    private readonly _id: DeviceID;
    private _forwarding_table: ForwardingInformationBase = new ForwardingInformationBase();
    public _arp_table: ArpTable = new ArpTable(); /* don't keep this public */
    private _routing_table: RoutingTable = new RoutingTable();
    protected _network_controller: NetworkController = new NetworkController(this);
    protected readonly _l3infs: L3Interface[] = [];
    protected readonly _l2infs: L2Interface[] = [];
    private static DeviceList = new IdentifiedList<Device>();

    public constructor() {
        console.error("Note: Device ArpTable is currently public");
        let assigned = false;
        while (!assigned) {
            const devid = DeviceID.rand();
            const device = new DeviceID(devid)
            if (!Device.DeviceList.existsId(device)) {
                this._id = device;
                Device.DeviceList.push(this);
                assigned = true;
            }
        }
    }

    /**
     * Adds a device to the topology
     * Note: this function will (likely) later become the sole way to create devices
     * since it allows the program to create objects that are stored exclusively in the
     * DeviceList array
     * @param device Device to add
     * @returns Device's ID as a number
     */
    public static createDevice(device: Device): number {
        return device._id.value;
    }

    /**
     * Deletes a device from the topology
     * @param deviceId The ID of the device to delete as a number
     * @returns boolean indicating whether a device with the given ID existed and was deleted
     */
    public static deleteDevice(deviceId: number): boolean {
        const device = this.DeviceList.itemFromId(new DeviceID(deviceId));
        if (device !== undefined) {
            for (let l2inf of device._l2infs) {
                InfMatrix.delete(l2inf);
            }
            for (let l3inf of device._l3infs) {
                InfMatrix.delete(l3inf);
            }
            Device.DeviceList.delete(device);
            return true;
        }
        return false;
    }

    public static get numOfDevices(): number {
        return this.DeviceList.length;
    }

    public getId(): Readonly<DeviceID> {
        return this._id;
    }

    public compare(other: this): number {
        return this._id.compare(other._id);
    }

    public clearFib(mac: MacAddress) {
        if (!this.hasInfWithMac(mac)) {
            throw Error(`Device does not have MAC address ${mac}`);
        }
        this._forwarding_table.clearValue(mac);
        this._arp_table.clearValue(mac);
    }

    /**
     * Encapsulates and attempts to send a packet
     * @param packet The packet to encapsulate as a frame and send
     * @returns boolean indicating whether the device was able to send the packet
     */
    private tryEncapsulateAndSend(packet: Ipv4Packet): boolean {
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // if the subnet of the packet matches the subnet of one of this device's infs,
            // then send a local packet
            if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // use the ARP table to try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    setTimeout(() => {
                        l3inf.send(new Frame(try_mac[0], l3inf.mac, EtherType.IPv4, packet.packet));
                    }, 10);
                    return true;
                }
                // if the destination MAC address is unknown, send an ARP request instead of the packet
                else {
                    l3inf.find(ipv4_dest);
                    return false;
                }
            }
        }
        // otherwise, use the routing table
        const try_route = this._routing_table.get(ipv4_dest)[0];
        // check if a route exists
        if (try_route !== undefined) {
            const next_hop = try_route[0];
            const inf = this.getInfFromIpv4(try_route[1]);
            // if the local interface exists, try sending a frame
            if (inf !== undefined) {
                // use the ARP table to try to get the MAC address of the next hop
                const try_mac = this._arp_table.get(next_hop);
                if (try_mac !== undefined) {
                    setTimeout(() => {
                        inf.send(new Frame(try_mac[0], inf.mac, EtherType.IPv4, packet.packet));
                    }, 10);
                    return true;
                }
                // if the MAC address is unknown, send an ARP request instead of the packet
                else {
                    inf.find(ipv4_dest);
                    return false;
                }

            }
        }
        return false;
    }

    private hasL3Infs(): boolean {
        return this._l3infs.length > 0;
    }

    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans within an object for whether to process and whether to forward the frame, respectively.
     * The object wrapper allows each object to be passed by reference to other functions.
     */
    private analyze(frame: Frame): [{value: boolean}, {value: boolean}] {
        let forward = {value: true};
        let process = {value: false};

        // if this device has the frame's destination MAC address, *do not* forward the frame
        // if this device has the frame's destination MAC address, *do* process the frame
        if (this._l2infs.some((x) => x.getId().compare(frame.dest_mac) == 0) || this._l3infs.some((x) => x.getId().compare(frame.dest_mac) == 0)) {
            forward.value = false;
            process.value = true;
        }

        // if the frame was broadcasted, *do* process the frame
        if (frame.dest_mac.toArray().every((x) => x == 0xFF)) {
            process.value = true;
        }

        return [process, forward];
    }

    private hasInfWithMac(mac: MacAddress): boolean {
        return [...this._l2infs, ...this._l3infs].some((x) => x.mac.compare(mac) == 0);
    }

    private hasInfWithIpv4(ipv4: Ipv4Address): boolean {
        return this._l3infs.some((x) => x.ipv4.compare(ipv4) == 0);
    }

    private getInfFromMac(mac: MacAddress): L2Interface | L3Interface {
        return [...this._l2infs, ...this._l3infs].find((x) => x.mac.compare(mac) == 0);
    }

    private getInfFromIpv4(ipv4: Ipv4Address): L3Interface {
        return this._l3infs.find((x) => x.ipv4.compare(ipv4) == 0);
    }

    // Note: what type should the packet sending/receiving functions return? bool, void, etc.?
    public async processFrame(frame: Frame, ingress_mac: MacAddress): Promise<boolean> {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);

        setTimeout(() => {
            // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
            if (!this.hasInfWithMac(frame.src_mac)  && !frame.src_mac.isBroadcast()) {
                this._forwarding_table.set(frame.src_mac, ingress_mac);
            }
            /**
             * Currently, processing happens before forwarding. Consider whether this is the best option.
             * To allow for Per-Hop Behaviors, this order appears to make the most sense.
             */
            // many protocols only apply to L3 devices (generalize to devices with L3 ports)
            if (should_process.value) {
                switch (ethertype) {
                    case EtherType.ARP: if (this.hasL3Infs) {
                        const packet = ArpPacket.parsePacket(frame.packet);
                        this.processARP(packet, ingress_mac, should_forward);
                        break;
                    }
                    case EtherType.IPv4: if (this.hasL3Infs)  {
                        const packet = Ipv4Packet.parsePacket(frame.packet);
                        if (Ipv4Packet.verifyChecksum(packet)) {
                            console.log("IPv4 checksum verification succeeded!")
                            this.processIpv4(packet, ingress_mac);
                        }
                        else {
                            console.log("IPv4 checksum verification failed!")
                            should_forward.value = false;
                        }
                        break;
                    }
                    case EtherType.IPv6:
                    default:
                        break;
                }
            }
        }, 0);
        setTimeout(() => {
            if (should_forward.value) {
                console.log(`---> ${ingress_mac}: ${should_forward.value ? "should" : "should not"} forward`)
                this.forward(frame, ingress_mac);
            }
        }, 0);
        return true;
    }

    private async broadcastInf(frame: Frame, ingress_inf: L2Interface | L3Interface) {
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // valid interfaces are up (on and connected to), not the same as the ingress, and have the same VLAN as the ingress
        const broadcast_domain = this._l2infs.filter((x) => x.isActive() && x.mac.compare(ingress_inf.mac) != 0 && x.vlan == ingress_inf.vlan);
        for (let inf of broadcast_domain) {
            console.log(`broadcast - forwarding from ${inf.mac}`);
            await inf.send(frame);
        }
    }

    /**
     * Attempts to forward a frame based on its destination MAC address
     * @param frame the frame to forward
     * @param ingress_mac the MAC address of the interface on which the frame was initially received
     */
    private async forward(frame: Frame, ingress_mac: MacAddress) {
        const dest_mac = frame.dest_mac;
        const ingress_inf = this.getInfFromMac(ingress_mac);
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // if dest_mac is broadcast, send to all non-ingress frames in the same broadcast domain
        if (dest_mac.isBroadcast()) {
            await this.broadcastInf(frame, ingress_inf)
        }
        // otherwise, if the destination MAC is in the forwarding table, forward out of that interface
        else if (this._forwarding_table.has(dest_mac)) {
            const egress_inf = this.getInfFromMac(this._forwarding_table.get(dest_mac));
            if (egress_inf.isActive()) {
                await egress_inf.send(frame);
            }
        }
        // otherwise, frame gets dropped
    }

    // modeled on RFC 826 "Packet Reception"
    private async processARP(arp_request: ArpPacket, ingress_mac: MacAddress, should_forward: {value: boolean}) {
        const op = arp_request.op;
        // skipped check for Ethernet and IPv4 support (it would return true)
        let merge = false;
        if (this._arp_table.has(arp_request.src_pa)) {
            this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            merge = true;
        }
        const try_inf = this.getInfFromIpv4(arp_request.dest_pa);
        if (try_inf !== undefined) {
            if (!merge) {
                this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            }
            if (op == OP.REQUEST) {
                console.log(`${this._l3infs[0].mac}: replying for ARP`);
                should_forward.value = false
                const arp_reply = arp_request.makeReply(try_inf.mac);
                const frame = new Frame(arp_reply.dest_ha, try_inf.mac, EtherType.ARP, arp_reply.packet);
                await this.getInfFromMac(try_inf.mac).send(frame);
            }

        }
    }

    private async processIpv4(ipv4_packet: Ipv4Packet, ingress_mac) {
        // if this device is the destination, process the packet within
        if (this.hasInfWithIpv4(ipv4_packet.dest)) {
            switch (ipv4_packet.protocol) {
                case InternetProtocolNumbers.ICMP:
                    console.log("I've received an ICMP packet!");
                    break;
                case InternetProtocolNumbers.TCP:
                    break;
                case InternetProtocolNumbers.UDP:
                    break;
            }
        }
        // otherwise, forward the packet to its destination
        else {
            this.tryEncapsulateAndSend(Ipv4Packet.copyAndDecrement(ipv4_packet));
        }
    }

    private async processICMP() {

    }

    public sendICMPEcho(dest_ipv4: Ipv4Address) {
        const packet = new Ipv4Packet(
            0, 0, 255, InternetProtocolNumbers.ICMP, this._l3infs[0].ipv4, dest_ipv4, [], new Uint8Array()
        )
        this.tryEncapsulateAndSend(packet);
    }

}

/**
 * Acts as a middle-man between the network interfaces and the device itself
 */
export class NetworkController {
    private readonly _device: Device;

    public constructor(device: Device) {
        this._device = device;
    }

    /**
     * Processes a frame by sending it to the device
     * @param frame the frame to process
     */
    public async receive(frame: Frame, ingress_mac: MacAddress) {
        await this._device.processFrame(frame, ingress_mac);
    }

    public clearFib(mac: MacAddress) {
        this._device.clearFib(mac);
    }
}

class PersonalComputer extends Device {
    public constructor() {
        super();
        this._l3infs.push(new L3Interface(this._network_controller));
    }

    public set ipv4(ipv4: [number, number, number, number]) {
        this._l3infs[0].ipv4.value = ipv4;
    }

    public get ipv4(): Ipv4Address {
        return this._l3infs[0].ipv4;
    }

    public set ipv4_prefix(ipv4_prefix: number) {
        this._l3infs[0].ipv4_prefix.value = ipv4_prefix;
        // console.log(`${this._interfaces[0].ipv4_prefix} - ${this._inf.ipv4_mask}`);
    }

    public get inf(): L3Interface {
        return this._l3infs[0];;
    }
}

class Switch extends Device {
    public constructor(num_inf: number) {
        super();
        for (let i=0; i < num_inf; i++) {
            this._l2infs.push(new L2Interface(this._network_controller));
        }
        InfMatrix.link(...this._l2infs.map((x) => x.mac));
    }

    public get l2infs(): L2Interface[] {
        return this._l2infs;
    }
}

async function test_icmp() {
    const pc1 = new PersonalComputer();
    const pc2 = new PersonalComputer();
    const pc3 = new PersonalComputer();
    const sw1 = new Switch(5);
    const sw2 = new Switch(5);
    const sw3 = new Switch(5);
    pc1.ipv4 = [192,168,0,10];
    pc2.ipv4 = [192,168,0,20];
    console.log(`pc1:\t${pc1.inf.mac}`);
    console.log(`sw1[0]:\t${sw1.l2infs[0].mac}`);
    console.log(`sw1[1]:\t${sw1.l2infs[1].mac}`);
    console.log(`sw1[2]:\t${sw1.l2infs[2].mac}`);
    console.log(`sw2[0]:\t${sw2.l2infs[0].mac}`);
    console.log(`sw2[1]:\t${sw2.l2infs[1].mac}`);
    console.log(`sw3[0]:\t${sw3.l2infs[0].mac}`);
    console.log(`sw3[1]:\t${sw3.l2infs[1].mac}`);
    console.log(`pc2:\t${pc2.inf.mac}`);
    console.log(`pc3:\t${pc3.inf.mac}`);
    InfMatrix.connect(pc1.inf.mac, sw1.l2infs[0].mac);
    InfMatrix.connect(sw1.l2infs[1].mac, sw2.l2infs[0].mac);
    InfMatrix.connect(sw3.l2infs[0].mac, sw1.l2infs[2].mac);
    InfMatrix.connect(pc3.inf.mac, sw3.l2infs[1].mac);
    InfMatrix.connect(sw2.l2infs[1].mac, pc2.inf.mac);

    let i = 0;
    let check;

    check = pc1._arp_table.has(pc2.ipv4);
    console.log(`--> !!!!! ${check}`);
    pc1.sendICMPEcho(pc2.ipv4);
    i++;

    const waiting = setInterval(() => {
        if (check || i >= 5) {
            clearInterval(waiting);
        }
        else {
            check = pc1._arp_table.has(pc2.ipv4);
            console.log(`--> !!!!! ${check}`);
            pc1.sendICMPEcho(pc2.ipv4);
            i++;
        }
    }, 1000)
}
test_icmp();