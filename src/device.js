"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkController = exports.Device = void 0;
const addressing_js_1 = require("./addressing.js");
const arp_js_1 = require("./arp.js");
const forwarding_js_1 = require("./forwarding.js");
const frame_js_1 = require("./frame.js");
const interface_js_1 = require("./interface.js");
const ip_js_1 = require("./ip.js");
const routing_js_1 = require("./routing.js");
class Device {
    constructor() {
        this._forwarding_table = new forwarding_js_1.ForwardingInformationBase();
        this._arp_table = new arp_js_1.ArpTable(); /* don't keep this public */
        this._routing_table = new routing_js_1.RoutingTable();
        this._network_controller = new NetworkController(this);
        this._l3infs = [];
        this._l2infs = [];
        console.error("Note: Device ArpTable is currently public");
        let assigned = false;
        while (!assigned) {
            const devid = addressing_js_1.DeviceID.rand();
            const device = new addressing_js_1.DeviceID(devid);
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
    static createDevice(device) {
        return device._id.value;
    }
    /**
     * Deletes a device from the topology
     * @param deviceId The ID of the device to delete as a number
     * @returns boolean indicating whether a device with the given ID existed and was deleted
     */
    static deleteDevice(deviceId) {
        const device = this.DeviceList.itemFromId(new addressing_js_1.DeviceID(deviceId));
        if (device !== undefined) {
            for (let l2inf of device._l2infs) {
                interface_js_1.InfMatrix.delete(l2inf);
            }
            for (let l3inf of device._l3infs) {
                interface_js_1.InfMatrix.delete(l3inf);
            }
            Device.DeviceList.delete(device);
            return true;
        }
        return false;
    }
    static get numOfDevices() {
        return this.DeviceList.length;
    }
    getId() {
        return this._id;
    }
    compare(other) {
        return this._id.compare(other._id);
    }
    clearFib(mac) {
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
    tryEncapsulateAndSend(packet) {
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // if the subnet of the packet matches the subnet of one of this device's infs,
            // then send a local packet
            if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // use the ARP table to try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    setTimeout(() => {
                        l3inf.send(new frame_js_1.Frame(try_mac[0], l3inf.mac, frame_js_1.EtherType.IPv4, packet.packet));
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
                        inf.send(new frame_js_1.Frame(try_mac[0], inf.mac, frame_js_1.EtherType.IPv4, packet.packet));
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
    hasL3Infs() {
        return this._l3infs.length > 0;
    }
    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans within an object for whether to process and whether to forward the frame, respectively.
     * The object wrapper allows each object to be passed by reference to other functions.
     */
    analyze(frame) {
        let forward = { value: true };
        let process = { value: false };
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
    hasInfWithMac(mac) {
        return [...this._l2infs, ...this._l3infs].some((x) => x.mac.compare(mac) == 0);
    }
    hasInfWithIpv4(ipv4) {
        return this._l3infs.some((x) => x.ipv4.compare(ipv4) == 0);
    }
    getInfFromMac(mac) {
        return [...this._l2infs, ...this._l3infs].find((x) => x.mac.compare(mac) == 0);
    }
    getInfFromIpv4(ipv4) {
        return this._l3infs.find((x) => x.ipv4.compare(ipv4) == 0);
    }
    // Note: what type should the packet sending/receiving functions return? bool, void, etc.?
    async processFrame(frame, ingress_mac) {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);
        setTimeout(() => {
            // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
            if (!this.hasInfWithMac(frame.src_mac) && !frame.src_mac.isBroadcast()) {
                this._forwarding_table.set(frame.src_mac, ingress_mac);
            }
            /**
             * Currently, processing happens before forwarding. Consider whether this is the best option.
             * To allow for Per-Hop Behaviors, this order appears to make the most sense.
             */
            // many protocols only apply to L3 devices (generalize to devices with L3 ports)
            if (should_process.value) {
                switch (ethertype) {
                    case frame_js_1.EtherType.ARP: if (this.hasL3Infs) {
                        const packet = arp_js_1.ArpPacket.parsePacket(frame.packet);
                        this.processARP(packet, ingress_mac, should_forward);
                        break;
                    }
                    case frame_js_1.EtherType.IPv4: if (this.hasL3Infs) {
                        const packet = ip_js_1.Ipv4Packet.parsePacket(frame.packet);
                        if (ip_js_1.Ipv4Packet.verifyChecksum(packet)) {
                            console.log("IPv4 checksum verification succeeded!");
                            this.processIpv4(packet, ingress_mac);
                        }
                        else {
                            console.log("IPv4 checksum verification failed!");
                            should_forward.value = false;
                        }
                        break;
                    }
                    case frame_js_1.EtherType.IPv6:
                    default:
                        break;
                }
            }
        }, 0);
        setTimeout(() => {
            if (should_forward.value) {
                console.log(`---> ${ingress_mac}: ${should_forward.value ? "should" : "should not"} forward`);
                this.forward(frame, ingress_mac);
            }
        }, 0);
        return true;
    }
    async broadcastInf(frame, ingress_inf) {
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
    async forward(frame, ingress_mac) {
        const dest_mac = frame.dest_mac;
        const ingress_inf = this.getInfFromMac(ingress_mac);
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // if dest_mac is broadcast, send to all non-ingress frames in the same broadcast domain
        if (dest_mac.isBroadcast()) {
            await this.broadcastInf(frame, ingress_inf);
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
    async processARP(arp_request, ingress_mac, should_forward) {
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
            if (op == arp_js_1.OP.REQUEST) {
                console.log(`${this._l3infs[0].mac}: replying for ARP`);
                should_forward.value = false;
                const arp_reply = arp_request.makeReply(try_inf.mac);
                const frame = new frame_js_1.Frame(arp_reply.dest_ha, try_inf.mac, frame_js_1.EtherType.ARP, arp_reply.packet);
                await this.getInfFromMac(try_inf.mac).send(frame);
            }
        }
    }
    async processIpv4(ipv4_packet, ingress_mac) {
        // if this device is the destination, process the packet within
        if (this.hasInfWithIpv4(ipv4_packet.dest)) {
            switch (ipv4_packet.protocol) {
                case ip_js_1.InternetProtocolNumbers.ICMP:
                    console.log("I've received an ICMP packet!");
                    break;
                case ip_js_1.InternetProtocolNumbers.TCP:
                    break;
                case ip_js_1.InternetProtocolNumbers.UDP:
                    break;
            }
        }
        // otherwise, forward the packet to its destination
        else {
            this.tryEncapsulateAndSend(ip_js_1.Ipv4Packet.copyAndDecrement(ipv4_packet));
        }
    }
    async processICMP() {
    }
    sendICMPEcho(dest_ipv4) {
        const packet = new ip_js_1.Ipv4Packet(0, 0, 255, ip_js_1.InternetProtocolNumbers.ICMP, this._l3infs[0].ipv4, dest_ipv4, [], new Uint8Array());
        this.tryEncapsulateAndSend(packet);
    }
}
exports.Device = Device;
Device.DeviceList = new interface_js_1.IdentifiedList();
/**
 * Acts as a middle-man between the network interfaces and the device itself
 */
class NetworkController {
    constructor(device) {
        this._device = device;
    }
    /**
     * Processes a frame by sending it to the device
     * @param frame the frame to process
     */
    async receive(frame, ingress_mac) {
        await this._device.processFrame(frame, ingress_mac);
    }
    clearFib(mac) {
        this._device.clearFib(mac);
    }
}
exports.NetworkController = NetworkController;
class PersonalComputer extends Device {
    constructor() {
        super();
        this._l3infs.push(new interface_js_1.L3Interface(this._network_controller));
    }
    set ipv4(ipv4) {
        this._l3infs[0].ipv4.value = ipv4;
    }
    get ipv4() {
        return this._l3infs[0].ipv4;
    }
    set ipv4_prefix(ipv4_prefix) {
        this._l3infs[0].ipv4_prefix.value = ipv4_prefix;
        // console.log(`${this._interfaces[0].ipv4_prefix} - ${this._inf.ipv4_mask}`);
    }
    get inf() {
        return this._l3infs[0];
        ;
    }
}
class Switch extends Device {
    constructor(num_inf) {
        super();
        for (let i = 0; i < num_inf; i++) {
            this._l2infs.push(new interface_js_1.L2Interface(this._network_controller));
        }
        interface_js_1.InfMatrix.link(...this._l2infs.map((x) => x.mac));
    }
    get l2infs() {
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
    pc1.ipv4 = [192, 168, 0, 10];
    pc2.ipv4 = [192, 168, 0, 20];
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
    interface_js_1.InfMatrix.connect(pc1.inf.mac, sw1.l2infs[0].mac);
    interface_js_1.InfMatrix.connect(sw1.l2infs[1].mac, sw2.l2infs[0].mac);
    interface_js_1.InfMatrix.connect(sw3.l2infs[0].mac, sw1.l2infs[2].mac);
    interface_js_1.InfMatrix.connect(pc3.inf.mac, sw3.l2infs[1].mac);
    interface_js_1.InfMatrix.connect(sw2.l2infs[1].mac, pc2.inf.mac);
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
    }, 1000);
}
test_icmp();
//# sourceMappingURL=device.js.map