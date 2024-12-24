"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkController = exports.Device = void 0;
const addressing_js_1 = require("./addressing.js");
const arp_js_1 = require("./arp.js");
const forwarding_js_1 = require("./forwarding.js");
const frame_js_1 = require("./frame.js");
const interface_js_1 = require("./interface.js");
class Device {
    constructor() {
        this._l3infs = [];
        this._l2infs = [];
        this._network_controller = new NetworkController(this);
        this._arp_table = new arp_js_1.ArpTable();
        this._forwarding_table = new forwarding_js_1.ForwardingInformationBase();
        let assigned = false;
        while (!assigned) {
            const devid = addressing_js_1.DeviceID.rand();
            const device = new addressing_js_1.DeviceID(devid);
            if (!DeviceList.existsId(device)) {
                this._id = device;
                DeviceList.push(this);
                assigned = true;
            }
        }
    }
    getId() {
        return this._id;
    }
    compare(other) {
        return this._id.compare(other._id);
    }
    clearFib(mac) {
        if (!this.hasInf(mac)) {
            throw Error(`Device does not have MAC address ${mac}`);
        }
        this._forwarding_table.clearValue(mac);
        this._arp_table.clearValue(mac);
    }
    encapsulateAndSend(packet) {
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // check if the subnets match
            if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    return new frame_js_1.Frame(try_mac[0], l3inf.mac, frame_js_1.EtherType.IPv4, packet.packet);
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
        throw "TODO: implement [forward to default gateway]";
    }
    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans for whether to process and whether to forward the frame, respectively
     */
    analyze(frame) {
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
    hasInf(mac) {
        return [...this._l2infs, ...this._l3infs].some((x) => x.mac.compare(mac) == 0);
    }
    getInf(mac) {
        return [...this._l2infs, ...this._l3infs].find((x) => x.mac.compare(mac) == 0);
    }
    // Note: what type should the packet sending/receiving functions return? bool, void, etc.?
    async receive(frame, ingress_mac) {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);
        // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
        if (!this.hasInf(frame.src_mac) && !frame.src_mac.isBroadcast()) {
            this._forwarding_table.set(frame.src_mac, ingress_mac);
        }
        /**
         * Currently, processing happens before forwarding. Consider whether this is the best option.
         * To allow for Per-Hop Behaviors, this order appears to make the most sense.
         */
        if (should_process) {
            switch (ethertype) {
                case frame_js_1.EtherType.ARP:
                    const packet = arp_js_1.ArpPacket.parsePacket(frame.packet);
                    setTimeout(async () => {
                        await this.processARP(packet, ingress_mac, [should_forward]);
                    }, 10);
                    break;
                case frame_js_1.EtherType.IPv4:
                    setTimeout(() => {
                        // this.processIpv4(...)
                    }, 10);
                    break;
                case frame_js_1.EtherType.IPv6:
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
    async broadcastInf(frame, ingress_inf) {
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
    async forward(frame, ingress_mac) {
        const dest_mac = frame.dest_mac;
        const ingress_inf = this.getInf(ingress_mac);
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // if dest_mac is broadcast, send to all non-ingress frames in the same broadcast domain
        if (dest_mac.isBroadcast()) {
            await this.broadcastInf(frame, ingress_inf);
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
    async processARP(arp_request, ingress_mac, should_forward) {
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
            if (op == arp_js_1.OP.REQUEST) {
                console.log(`${this._l3infs[0].mac}: replying for ARP`);
                should_forward[0] = false;
                const arp_reply = arp_request.makeReply(try_inf.mac);
                const frame = new frame_js_1.Frame(arp_reply.dest_ha, try_inf.mac, frame_js_1.EtherType.ARP, arp_reply.packet);
                await this.getInf(try_inf.mac).send(frame);
            }
        }
    }
}
exports.Device = Device;
let DeviceList = new interface_js_1.IdentifiedList();
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
        await this._device.receive(frame, ingress_mac);
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
    }
    get l2infs() {
        return this._l2infs;
    }
}
async function main() {
    const pc1 = new PersonalComputer();
    const pc2 = new PersonalComputer();
    const pc3 = new PersonalComputer();
    const sw1 = new Switch(5);
    const sw2 = new Switch(5);
    pc1.ipv4 = [192, 168, 0, 10];
    pc2.ipv4 = [192, 168, 0, 20];
    console.log(`pc1:\t${pc1.inf.mac}`);
    console.log(`sw1[0]:\t${sw1.l2infs[0].mac}`);
    console.log(`sw1[1]:\t${sw1.l2infs[1].mac}`);
    console.log(`sw1[2]:\t${sw1.l2infs[2].mac}`);
    console.log(`sw2[0]:\t${sw2.l2infs[0].mac}`);
    console.log(`sw2[1]:\t${sw2.l2infs[1].mac}`);
    console.log(`pc2:\t${pc2.inf.mac}`);
    console.log(`pc3:\t${pc3.inf.mac}`);
    interface_js_1.InfMatrix.connect(pc1.inf.mac, sw1.l2infs[0].mac);
    interface_js_1.InfMatrix.connect(sw1.l2infs[1].mac, sw2.l2infs[0].mac);
    interface_js_1.InfMatrix.connect(pc3.inf.mac, sw1.l2infs[2].mac);
    interface_js_1.InfMatrix.connect(sw2.l2infs[1].mac, pc2.inf.mac);
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
    }, 1000);
}
main();
//# sourceMappingURL=device.js.map