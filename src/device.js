"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkController = exports.Device = void 0;
const addressing_js_1 = require("./addressing.js");
const arp_js_1 = require("./arp.js");
const forwarding_js_1 = require("./forwarding.js");
const frame_js_1 = require("./frame.js");
const icmp_js_1 = require("./icmp.js");
const interface_js_1 = require("./interface.js");
const ip_js_1 = require("./ip.js");
const routing_js_1 = require("./routing.js");
const socket_js_1 = require("./socket.js");
var IpResponse;
(function (IpResponse) {
    IpResponse[IpResponse["SENT"] = 0] = "SENT";
    IpResponse[IpResponse["TIME_EXCEEDED"] = 1] = "TIME_EXCEEDED";
    IpResponse[IpResponse["HOST_UNREACHABLE"] = 2] = "HOST_UNREACHABLE";
    IpResponse[IpResponse["NET_UNREACHABLE"] = 3] = "NET_UNREACHABLE";
})(IpResponse || (IpResponse = {}));
class Device {
    constructor() {
        this._forwarding_table = new forwarding_js_1.ForwardingInformationBase();
        this._arp_table = new arp_js_1.ArpTable(); /* don't keep this public */
        this._routing_table = new routing_js_1.RoutingTable();
        this._network_controller = new NetworkController(this);
        this._env = new Map();
        this._sockets = new socket_js_1.SocketTable();
        this._l3infs = [];
        this._l2infs = [];
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
        // time exceeded
        if (packet.ttl <= 0) {
            return IpResponse.TIME_EXCEEDED;
        }
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // check if this device is the destination
            if (l3inf.ipv4.compare(ipv4_dest) == 0) {
                // packets a device sends to itself would really be sent/received by the loopback interface
                // (could be implemented later on)
                l3inf.receive(new frame_js_1.Frame(l3inf.mac, l3inf.mac, frame_js_1.EtherType.IPv4, packet.packet), l3inf.mac);
                return IpResponse.SENT;
            }
            // if the subnet of the packet matches the subnet of one of this device's infs,
            // then send a local packet
            else if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // use the ARP table to try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    setTimeout(() => {
                        l3inf.send(new frame_js_1.Frame(try_mac[0], l3inf.mac, frame_js_1.EtherType.IPv4, packet.packet));
                    }, 10);
                    return IpResponse.SENT;
                }
                // if the destination MAC address is unknown, send an ARP request instead of the packet
                // destination host unreachable
                else {
                    l3inf.find(ipv4_dest);
                    return IpResponse.HOST_UNREACHABLE;
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
                    return IpResponse.SENT;
                }
                // if the MAC address is unknown, send an ARP request instead of the packet
                // destination network unreachable
                else {
                    inf.find(next_hop);
                    return IpResponse.NET_UNREACHABLE;
                }
            }
        }
        // destination network unreachable
        return IpResponse.NET_UNREACHABLE;
    }
    hasL2Infs() {
        return this._l2infs.length > 0;
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
    async processFrame(frame, ingress_mac) {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);
        setTimeout(() => {
            // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
            // this should only apply to L2 infs, since L3 infs will use their ARP table instead
            // although definitely verify that this doesn't cause issues
            if (this.getInfFromMac(ingress_mac).isL2() && !this.hasInfWithMac(frame.src_mac) && !frame.src_mac.isBroadcast()) {
                this._forwarding_table.set(frame.src_mac, ingress_mac);
            }
            /**
             * Currently, processing happens before forwarding. Consider whether this is the best option.
             * To allow for Per-Hop Behaviors, this order appears to make the most sense.
             */
            // many protocols only apply to L3 devices (generalize to devices with L3 ports)
            if (should_process.value) {
                switch (ethertype) {
                    case frame_js_1.EtherType.ARP: if (this.hasL3Infs()) {
                        const packet = arp_js_1.ArpPacket.parsePacket(frame.packet);
                        this.processARP(packet, ingress_mac, should_forward);
                        break;
                    }
                    case frame_js_1.EtherType.IPv4: if (this.hasL3Infs()) {
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
        // RFC 1812 5.2.1 may be used as a guide
        switch (ipv4_packet.protocol) {
            case ip_js_1.InternetProtocolNumbers.ICMP:
                const icmp_datagram = icmp_js_1.IcmpDatagram.parse(ipv4_packet.data);
                if (icmp_js_1.IcmpDatagram.verifyChecksum(icmp_datagram)) {
                    console.log("ICMP checksum verification succeeded!");
                    this.processICMP(icmp_datagram, ipv4_packet);
                    return true;
                }
                else {
                    console.log("ICMP checksum verification failed!");
                }
                break;
            case ip_js_1.InternetProtocolNumbers.TCP:
                break;
            case ip_js_1.InternetProtocolNumbers.UDP:
                break;
        }
        if (!this.hasInfWithIpv4(ipv4_packet.dest)) {
            if (this.tryEncapsulateAndSend(ip_js_1.Ipv4Packet.copyAndDecrement(ipv4_packet)) == IpResponse.SENT) {
                return true;
            }
        }
        return false;
    }
    async processICMP(icmp_datagram, ipv4_packet) {
        // check for any sockets
        for (let icmp_socket of this._sockets.getIcmpSockets()) {
            const matched = icmp_socket.check(icmp_datagram, ipv4_packet);
            console.log(`---------- checking socket: ${matched} ----------`);
            // one packet can only match one socket
            if (matched) {
                break;
            }
        }
        // if this device is not the destination, try to forward the request
        // return ICMP errors if any arise
        if (!this.hasInfWithIpv4(ipv4_packet.dest)) {
            const sent = this.tryEncapsulateAndSend(ip_js_1.Ipv4Packet.copyAndDecrement(ipv4_packet));
            switch (sent) {
                case IpResponse.SENT:
                    return true;
                case IpResponse.HOST_UNREACHABLE:
                    return this.tryEncapsulateAndSend(new ip_js_1.Ipv4Packet(0, 0, 64, ip_js_1.InternetProtocolNumbers.ICMP, ipv4_packet.dest, ipv4_packet.src, [], icmp_js_1.IcmpDatagram.hostUnreachable(icmp_datagram, ipv4_packet).datagram)) == IpResponse.SENT;
                case IpResponse.NET_UNREACHABLE:
                    return this.tryEncapsulateAndSend(new ip_js_1.Ipv4Packet(0, 0, 64, ip_js_1.InternetProtocolNumbers.ICMP, ipv4_packet.dest, ipv4_packet.src, [], icmp_js_1.IcmpDatagram.netUnreachable(icmp_datagram, ipv4_packet).datagram)) == IpResponse.SENT;
                case IpResponse.TIME_EXCEEDED:
                    return this.tryEncapsulateAndSend(new ip_js_1.Ipv4Packet(0, 0, 64, ip_js_1.InternetProtocolNumbers.ICMP, ipv4_packet.dest, ipv4_packet.src, [], icmp_js_1.IcmpDatagram.timeExceeded(icmp_datagram, ipv4_packet).datagram)) == IpResponse.SENT;
            }
        }
        // otherwise, process the packet thoroughly
        switch (icmp_datagram.type) {
            // if the datagram is an Echo Request, send a reply
            case icmp_js_1.IcmpControlMessage.ECHO_REQUEST:
                console.log(`!! ICMP Request Received!`);
                const sent = this.tryEncapsulateAndSend(new ip_js_1.Ipv4Packet(0, 0, 64, ip_js_1.InternetProtocolNumbers.ICMP, ipv4_packet.dest, ipv4_packet.src, [], icmp_js_1.IcmpDatagram.echoReply(icmp_datagram).datagram));
                return sent == IpResponse.SENT;
            // Note: no packet will be forwarded if it's an Echo Reply
            // (so this block can be deleted later)
            case icmp_js_1.IcmpControlMessage.ECHO_REPLY:
                // check for an ICMP socket, see if this datagram matches its check function
                console.log(`!! ICMP Reply Received! (there are ${this._sockets.getIcmpSockets().size} sockets)`);
                return false;
        }
        return false;
    }
    async ping(dest_ipv4, count = Number.MAX_VALUE, ttl = 255) {
        const id = this._env.has('PING_SEQ') ? parseInt(this._env.get('PING_SEQ')) + 1 : 1;
        this._env.set('PING_SEQ', id.toString());
        let hits = 0;
        let echo_num = 1;
        if (await this.icmpEcho(dest_ipv4, id, echo_num, ttl) === icmp_js_1.IcmpControlMessage.ECHO_REPLY) {
            hits++;
        }
        echo_num++;
        const interval = setInterval(async () => {
            if (echo_num <= count) {
                if (await this.icmpEcho(dest_ipv4, id, echo_num, ttl) === icmp_js_1.IcmpControlMessage.ECHO_REPLY) {
                    hits++;
                }
                echo_num++;
            }
            else {
                console.log(`${hits}/${count}`);
                clearInterval(interval);
            }
        }, 1000);
    }
    /**
     * Sends an ICMP Echo and looks for a response
     * @param dest_ipv4 IPv4 address of the device to send the ICMP Echo to
     * @param id Identifier of the ICMP Echo
     * @param seq_num Sequence number of the ICMP Echo
     * @param ttl Initial time to live of the ICMP Echo
     * @returns If a response was given, the control message of the response. Otherwise, undefined.
     */
    async icmpEcho(dest_ipv4, id = 1, seq_num = 1, ttl = 255) {
        return new Promise((resolve) => {
            if (this.hasL3Infs()) {
                const icmp_request = icmp_js_1.IcmpDatagram.echoRequest(id, seq_num);
                const packet = new ip_js_1.Ipv4Packet(0, 0, ttl, ip_js_1.InternetProtocolNumbers.ICMP, this._l3infs[0].ipv4, dest_ipv4, [], icmp_request.datagram);
                if (this.tryEncapsulateAndSend(packet) == IpResponse.SENT) {
                    let start = performance.now();
                    const ping_socket = socket_js_1.Socket.icmpSocketFrom(icmp_request, packet);
                    this._sockets.addIcmpSocket(ping_socket);
                    console.log("----------- socket added ----------");
                    let i = 0;
                    const interval_length = 100;
                    const interval = setInterval(() => {
                        const datagram_received = ping_socket.hits > 0;
                        const timed_out = i >= 1000 / interval_length - 1;
                        if (datagram_received || timed_out) {
                            this._sockets.deleteIcmpSocket(ping_socket);
                            clearInterval(interval);
                            console.log("---------- socket deleted ---------");
                        }
                        if (datagram_received) {
                            let end = performance.now();
                            const datagram = ping_socket.matched_top;
                            console.log(`received ICMP ${icmp_js_1.IcmpControlMessage[datagram.type]} in ${end - start}`);
                            resolve(datagram.type);
                            return;
                        }
                        else if (timed_out) {
                            resolve(undefined);
                            return;
                        }
                        i++;
                    }, interval_length);
                }
                else {
                    resolve(icmp_js_1.IcmpControlMessage.UNREACHABLE);
                }
            }
            else {
                resolve(undefined);
            }
        });
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
    }
    set default_gateway(gateway) {
        this._routing_table.set(new addressing_js_1.Ipv4Address([0, 0, 0, 0]), new addressing_js_1.Ipv4Prefix(0), new addressing_js_1.Ipv4Address(gateway), this._l3infs[0].ipv4, 1);
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
class Router extends Device {
    constructor(num_inf) {
        super();
        for (let i = 0; i < num_inf; i++) {
            this._l3infs.push(new interface_js_1.L3Interface(this._network_controller));
        }
        interface_js_1.InfMatrix.link(...this._l3infs.map((x) => x.mac));
    }
    get l3infs() {
        return this._l3infs;
    }
}
async function test_icmp() {
    const pc1 = new PersonalComputer();
    const pc2 = new PersonalComputer();
    const sw1 = new Switch(2);
    const sw2 = new Switch(2);
    const ro1 = new Router(2);
    pc1.ipv4 = [192, 168, 0, 10];
    pc1.ipv4_prefix = 24;
    pc1.default_gateway = [192, 168, 0, 1];
    pc2.ipv4 = [192, 168, 1, 10];
    pc2.ipv4_prefix = 24;
    pc2.default_gateway = [192, 168, 1, 1];
    ro1.l3infs[0].ipv4 = [192, 168, 0, 1];
    ro1.l3infs[0].ipv4_prefix = 24;
    ro1.l3infs[1].ipv4 = [192, 168, 1, 1];
    ro1.l3infs[1].ipv4_prefix = 24;
    console.log(`pc1:\t${pc1.inf.mac}`);
    console.log(`pc2:\t${pc2.inf.mac}`);
    console.log(`sw1[0]:\t${sw1.l2infs[0].mac}`);
    console.log(`sw1[1]:\t${sw1.l2infs[1].mac}`);
    console.log(`sw2[0]:\t${sw2.l2infs[0].mac}`);
    console.log(`sw2[1]:\t${sw2.l2infs[1].mac}`);
    console.log(`ro1[0]:\t${ro1.l3infs[0].mac}`);
    console.log(`ro1[1]:\t${ro1.l3infs[1].mac}`);
    interface_js_1.InfMatrix.connect(pc1.inf.mac, sw1.l2infs[0].mac);
    interface_js_1.InfMatrix.connect(sw1.l2infs[1].mac, ro1.l3infs[0].mac);
    interface_js_1.InfMatrix.connect(ro1.l3infs[1].mac, sw2.l2infs[1].mac);
    interface_js_1.InfMatrix.connect(sw2.l2infs[0].mac, pc2.inf.mac);
    pc1.ping(pc2.ipv4, 4);
}
test_icmp();
//# sourceMappingURL=device.js.map