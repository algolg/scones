import { Ipv4Address, Identifier, DeviceID, MacAddress } from "./addressing.js";
import { ArpPacket, ArpTable, OP } from "./arp.js";
import { ForwardingInformationBase } from "./forwarding.js";
import { EtherType, Frame } from "./frame.js";
import { IdentifiedList, InfMatrix, L2Interface, L3Interface } from "./interface.js";
import { Ipv4Packet } from "./ip.js";

export interface IdentifiedItem {
    getId(): Identifier;
    compare(other: this): number;
}

export class Device implements IdentifiedItem {
    private readonly _id: DeviceID;
    private _forwarding_table: ForwardingInformationBase;
    public _arp_table: ArpTable; /* don't keep this public */
    // private _routing_table: RoutingTable; (once implemented, the default gateway/route will go here)
    protected _network_controller: NetworkController;
    protected readonly _l3infs: L3Interface[] = [];
    protected readonly _l2infs: L2Interface[] = [];

    public constructor() {
        this._network_controller = new NetworkController(this);
        this._arp_table = new ArpTable();
        this._forwarding_table = new ForwardingInformationBase();
        let assigned = false;
        while (!assigned) {
            const devid = DeviceID.rand();
            const device = new DeviceID(devid)
            if (!DeviceList.existsId(device)) {
                this._id = device;
                DeviceList.push(this);
                assigned = true;
            }
        }
    }

    public getId(): Readonly<DeviceID> {
        return this._id;
    }

    public compare(other: this): number {
        return this._id.compare(other._id);
    }

    public clearFib(mac: MacAddress) {
        if (!this.hasInf(mac)) {
            throw Error(`Device does not have MAC address ${mac}`);
        }
        this._forwarding_table.clearValue(mac);
        this._arp_table.clearValue(mac);
    }

    public encapsulateAndSend(packet: Ipv4Packet): Frame {
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // check if the subnets match
            if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    return new Frame(try_mac[0], l3inf.mac, EtherType.IPv4, packet.packet);
                }
                // if the MAC address is not in the ARP table,
                else {
                    // send an ARP request, then forward the frame
                    /**
                     * Note: technically, the original packet would be thrown away, and the
                     * application is supposed to retransmit it after the ARP request is
                     * resolved. However, I'm instead combining these two steps such that
                     * the packet is cached and sent immediately after the ARP request's
                     * resolution.
                     */
                    /**
                     * I'm now rethinking this interpretation, and might like to instead have
                     * the function run the find() function, check every ~500ms if the MAC
                     * address has arrived, and send the frame when it does. If it takes more
                     * than 5s, then don't send anything and return false.
                     */
                    /**
                     * More rethinking. The Internet never guarantees packet delivery. The
                     * application must resend packets on fail.
                     * 
                     * For example, ping will run encapsulteAndSend(icmp_request) once every
                     * second. Ping (i.e., the application itself) should decide the interval
                     * between requests and how many to send before ending. This function
                     * does not make any guarantees.
                     * 
                     * This function will try to get the destination MAC from the ARP table.
                     * If mac === undefined, run find() to try to populate the ARP table, but
                     * do not send any frame. Instead, return false to indicate that a frame
                     * was not sent.
                     * 
                     * This function may need to be renamed to tryEncapsulateAndSend
                     */
                    // l3inf.find(ipv4_dest).then(() => {
                    //     const mac = this._arp_table.get(ipv4_dest)[0];
                    //     if (mac !== undefined) {
                    //         return new Frame(mac, l3inf.mac, EtherType.IPv4, packet.packet);
                    //     }
                    // });
                }
            }
        }
        throw "TODO: implement [forward to default gateway]"
    }

    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans for whether to process and whether to forward the frame, respectively
     */
    private analyze(frame: Frame): [boolean, boolean] {
        let forward = true;
        let process = false;

        // if this device has the frame's destination MAC address, *do not* forward the frame
        // if this device has the frame's destination MAC address, *do* process the frame
        if (this._l2infs.some((x) => x.getId().compare(frame.dest_mac) == 0) || this._l3infs.some((x) => x.getId().compare(frame.dest_mac) == 0)) {
            forward = false;
            process = true;
        }

        // if the frame was broadcasted, *do* process the frame
        if (frame.dest_mac.toArray().every((x) => x == 0xFF)) {
            process = true;
        }

        return [process, forward];
    }

    private hasInf(mac: MacAddress): boolean {
        return [...this._l2infs, ...this._l3infs].some((x) => x.mac.compare(mac) == 0);
    }

    private getInf(mac: MacAddress): L2Interface | L3Interface {
        return [...this._l2infs, ...this._l3infs].find((x) => x.mac.compare(mac) == 0);
    }

    // Note: what type should the packet sending/receiving functions return? bool, void, etc.?
    public async receive(frame: Frame, ingress_mac: MacAddress): Promise<boolean> {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);

        // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
        if (!this.hasInf(frame.src_mac)  && !frame.src_mac.isBroadcast()) {
            this._forwarding_table.set(frame.src_mac, ingress_mac);
        }
        /**
         * Currently, processing happens before forwarding. Consider whether this is the best option.
         * To allow for Per-Hop Behaviors, this order appears to make the most sense.
         */
        if (should_process) {
            switch (ethertype) {
                case EtherType.ARP:
                    const packet = ArpPacket.parsePacket(frame.packet);
                    setTimeout(async () => {
                        await this.processARP(packet, ingress_mac, [should_forward]);
                    }, 10);
                    break;
                case EtherType.IPv4:
                    setTimeout(() => {
                        // this.processIpv4(...)
                    }, 10);
                    break;
                case EtherType.IPv6:
                default:
                    break;
            }
        }
        if (should_forward) {
            // does this setTimeout make a difference? test it out in more complex networks
            // (networks with many opportunities for switches to make extra broadcasts)
            setTimeout(async () => {
                await this.forward(frame, ingress_mac);
            }, 10);
        }
        return true;
    }

    private async broadcastInf(frame: Frame, ingress_inf: L2Interface | L3Interface) {
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // valid interfaces are up (on and connected to), not the same as the ingress, and have the same VLAN as the ingress
        const broadcast_domain = this._l2infs.filter((x) => x.isUp() && x.mac.compare(ingress_inf.mac) != 0 && x.vlan == ingress_inf.vlan);
        for (let inf of broadcast_domain) {
            console.log(`broadcast - forwarding from ${inf.mac}`);
            await inf.send(frame);
        }
    }

    private async forward(frame: Frame, ingress_mac: MacAddress) {
        const dest_mac = frame.dest_mac;
        const ingress_inf = this.getInf(ingress_mac);
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // if dest_mac is broadcast, send to all non-ingress frames in the same broadcast domain
        if (dest_mac.isBroadcast()) {
            await this.broadcastInf(frame, ingress_inf)
        }
        // otherwise, if the destination MAC is in the forwarding table, forward out of that interface
        else if (this._forwarding_table.has(dest_mac)) {
            const egress_inf = this.getInf(this._forwarding_table.get(dest_mac));
            if (egress_inf.isUp()) {
                await egress_inf.send(frame);
            }
        }
        // otherwise, frame gets dropped
    }

    // modeled on RFC 826 "Packet Reception"
    private async processARP(arp_request: ArpPacket, ingress_mac: MacAddress, should_forward: [boolean]) {
        const op = arp_request.op;
        // skipped check for Ethernet and IPv4 support (it would return true)
        let merge = false;
        if (this._arp_table.has(arp_request.src_pa)) {
            this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            merge = true;
        }
        const try_inf = this._l3infs.find((x) => x.ipv4.compare(arp_request.dest_pa) == 0);
        if (try_inf !== undefined) {
            if (!merge) {
                this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            }
            if (op == OP.REQUEST) {
                console.log(`${this._l3infs[0].mac}: replying for ARP`);
                should_forward[0] = false
                const arp_reply = arp_request.makeReply(try_inf.mac);
                const frame = new Frame(arp_reply.dest_ha, try_inf.mac, EtherType.ARP, arp_reply.packet);
                await this.getInf(try_inf.mac).send(frame);
            }

        }
    }

}
let DeviceList = new IdentifiedList<Device>();

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
        await this._device.receive(frame, ingress_mac);
    }

    public clearFib(mac: MacAddress) {
        this._device.clearFib(mac);
    }
}

class PersonalComputer extends Device {
    private _default_gateway: Ipv4Address;

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
    }

    public get l2infs(): L2Interface[] {
        return this._l2infs;
    }
}

async function main() {
    const pc1 = new PersonalComputer();
    const pc2 = new PersonalComputer();
    const pc3 = new PersonalComputer();
    const sw1 = new Switch(5);
    const sw2 = new Switch(5);
    pc1.ipv4 = [192,168,0,10];
    pc2.ipv4 = [192,168,0,20];
    console.log(`pc1:\t${pc1.inf.mac}`);
    console.log(`sw1[0]:\t${sw1.l2infs[0].mac}`);
    console.log(`sw1[1]:\t${sw1.l2infs[1].mac}`);
    console.log(`sw1[2]:\t${sw1.l2infs[2].mac}`);
    console.log(`sw2[0]:\t${sw2.l2infs[0].mac}`);
    console.log(`sw2[1]:\t${sw2.l2infs[1].mac}`);
    console.log(`pc2:\t${pc2.inf.mac}`);
    console.log(`pc3:\t${pc3.inf.mac}`);
    InfMatrix.connect(pc1.inf.mac, sw1.l2infs[0].mac);
    InfMatrix.connect(sw1.l2infs[1].mac, sw2.l2infs[0].mac);
    InfMatrix.connect(pc3.inf.mac, sw1.l2infs[2].mac);
    InfMatrix.connect(sw2.l2infs[1].mac, pc2.inf.mac);
    pc1.inf.find(pc2.ipv4);

    let i = 0;
    let check;

    check = pc1._arp_table.has(pc2.ipv4);
    console.log(`--> !!!!! ${check}`);
    i++;

    const waiting = setInterval(() => {
        if (check || i >= 5) {
            clearInterval(waiting);
        }
        else {
            check = pc1._arp_table.has(pc2.ipv4);
            console.log(`--> !!!!! ${check}`);
            i++;
        }
    }, 1000)
}
main();