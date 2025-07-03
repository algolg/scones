import { Ipv4Address, DeviceID, MacAddress, Ipv4Prefix } from "./addressing.js";
import { ArpPacket, ArpTable, OP } from "./protocols/arp.js";
import { ForwardingInformationBase } from "./forwarding.js";
import { DisplayFrame, EtherType, Frame } from "./frame.js";
import { IcmpControlMessage, IcmpDatagram } from "./protocols/icmp.js";
import { IdentifiedList, InfMatrix, L2Interface, L3Interface, VirtualL3Interface } from "./interface.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./protocols/ip.js";
import { RoutingTable } from "./routing.js";
import { Socket, SocketTable, SockType } from "./socket.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, ICON_SIZE, RECORDED_FRAMES, RECORDING_ON } from "./ui/variables.js";
import { UdpDatagram } from "./protocols/udp.js";
import { DhcpClient, DhcpServer } from "./protocols/dhcp.js";
var IpResponse;
(function (IpResponse) {
    IpResponse[IpResponse["SENT"] = 0] = "SENT";
    IpResponse[IpResponse["TIME_EXCEEDED"] = 1] = "TIME_EXCEEDED";
    IpResponse[IpResponse["HOST_UNREACHABLE"] = 2] = "HOST_UNREACHABLE";
    IpResponse[IpResponse["NET_UNREACHABLE"] = 3] = "NET_UNREACHABLE";
})(IpResponse || (IpResponse = {}));
;
export var DeviceType;
(function (DeviceType) {
    DeviceType[DeviceType["PC"] = 0] = "PC";
    DeviceType[DeviceType["SERVER"] = 1] = "SERVER";
    DeviceType[DeviceType["ROUTER"] = 2] = "ROUTER";
    DeviceType[DeviceType["SWITCH"] = 3] = "SWITCH";
})(DeviceType || (DeviceType = {}));
;
export class Device {
    constructor(device_type) {
        this._ping_terminal_lines = [];
        this._forwarding_table = new ForwardingInformationBase();
        this._arp_table = new ArpTable();
        this._network_controller = new NetworkController(this);
        this._env = new Map();
        this._sockets = new SocketTable(() => this.getL3Interfaces());
        this._l3infs = [];
        this._l2infs = [];
        this._allow_forwarding = true;
        this.getAllRoutes = () => this._routing_table?.getAllRoutes() ?? [];
        this.device_type = device_type;
        let assigned = false;
        while (!assigned) {
            const devid = DeviceID.rand();
            const device = new DeviceID(devid);
            if (!Device.DeviceList.existsId(device)) {
                assigned = true;
                this._id = device;
                Device.DeviceList.push(this);
            }
        }
        this._lib = new Libraries(() => this.getL2Interfaces(), () => this.getL3Interfaces(), async (dest_ipv4) => this.icmpEcho(dest_ipv4), (packet) => { this.tryEncapsulateAndSend(packet); }, (frame, egress_mac) => {
            if (RECORDING_ON) {
                const timestamp = performance.now();
                RECORDED_FRAMES.push([[new DisplayFrame(frame, egress_mac, () => this.coords)], timestamp]);
            }
            setTimeout(() => this.getInfFromMac(egress_mac)?.send(frame), 10);
        }, (sock, address, id) => this._sockets.bind(sock, address, id), (sock) => this._sockets.close(sock));
    }
    static getList() {
        return this.DeviceList;
    }
    static getIterator() {
        return this.DeviceList.values();
    }
    /**
     * Adds a device to the topology
     * @param device Device to add
     * @returns The added Device
     */
    static createDevice(device, x_coord, y_coord) {
        device.coords = [x_coord / CANVAS_WIDTH(), y_coord / CANVAS_HEIGHT()];
        return device;
    }
    /**
     * Connects two Devices using the first available interface. In the future this function should be replaced,
     * allowing users to select the interfaces to connect.
     * @param firstDevice first Device to connect
     * @param secondDevice second Device to connect
     * @returns boolean indicating whether the devices were successfully connected
     */
    static connectDevices(firstDevice, secondDevice) {
        const firstDevice_inf = [...firstDevice._l2infs, ...firstDevice._l3infs].find((x) => !InfMatrix.isConnected(x.mac));
        const secondDevice_inf = [...secondDevice._l2infs, ...secondDevice._l3infs].find((x) => !InfMatrix.isConnected(x.mac));
        if (firstDevice_inf !== undefined && secondDevice_inf !== undefined) {
            InfMatrix.connect(firstDevice_inf.mac, secondDevice_inf.mac);
            return true;
        }
        return false;
    }
    static moveDevice(device, new_x_coord, new_y_coord) {
        device.coords = [new_x_coord / CANVAS_WIDTH(), new_y_coord / CANVAS_HEIGHT()];
    }
    static existsDevice(x_coord, y_coord) {
        return this.DeviceList.some((dev) => Math.abs(dev.coords[0] * CANVAS_WIDTH() - x_coord) <= ICON_SIZE / 2 &&
            Math.abs(dev.coords[1] * CANVAS_HEIGHT() - y_coord) <= ICON_SIZE / 2);
    }
    static getDevice(x_coord, y_coord) {
        return this.DeviceList.find((dev) => Math.abs(dev.coords[0] * CANVAS_WIDTH() - x_coord) <= ICON_SIZE / 2 &&
            Math.abs(dev.coords[1] * CANVAS_HEIGHT() - y_coord) <= ICON_SIZE / 2) ?? null;
    }
    static getDeviceFromId(id) {
        return this.DeviceList.itemFromId(new DeviceID(id));
    }
    /**
     * Deletes a device from the topology
     * @param x_coord X-axis coordinate of the device to delete
     * @param y_coord Y-axis coordinate of the device to delete
     * @returns boolean indicating whether a device at the given coordinates existed and was deleted
     */
    static deleteDevice(x_coord, y_coord) {
        const device = this.getDevice(x_coord, y_coord);
        if (device) {
            for (let l2inf of device._l2infs) {
                InfMatrix.delete(l2inf);
            }
            for (let l3inf of device._l3infs) {
                if (device.dhcpEnabled(l3inf.mac)) {
                    device._dhcp_client.disable(l3inf.mac);
                }
                InfMatrix.delete(l3inf);
            }
            device._sockets.clear();
            Device.DeviceList.delete(device);
            return true;
        }
        return false;
    }
    /**
     * Deletes all devices and their interfaces
     */
    static clearTopology() {
        for (let device of this.DeviceList) {
            for (let l2inf of device._l2infs) {
                InfMatrix.delete(l2inf);
            }
            for (let l3inf of device._l3infs) {
                InfMatrix.delete(l3inf);
            }
        }
        this.DeviceList.splice(0, this.DeviceList.length);
    }
    static get numOfDevices() {
        return this.DeviceList.length;
    }
    get ping_terminal_lines() {
        return this._ping_terminal_lines;
    }
    get l2infs() {
        return this._l2infs;
    }
    get l3infs() {
        return this._l3infs;
    }
    getId() {
        return this._id;
    }
    compare(other) {
        return this._id.compare(other._id);
    }
    pushPingLine(line) {
        this._ping_terminal_lines.push(line);
    }
    clearPingTerminal() {
        this._ping_terminal_lines = [];
    }
    clearFib(mac) {
        if (!this.hasInfWithMac(mac)) {
            throw Error(`Device does not have MAC address ${mac}`);
        }
        this._forwarding_table.clearValue(mac);
        this._arp_table.clearValue(mac);
    }
    setRoute(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) {
        return this._routing_table?.set(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) ?? false;
    }
    deleteRoute(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) {
        return this._routing_table?.delete(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance) ?? false;
    }
    /**
     * Determines the IPv4 address to use as the source for an IP error message and sends the error message
     * @param errored_packet received packet which could not be sent
     * @param reply_data_func function which uses the received packet to generate a specific ICMP debug message
     * @returns boolean indicating whether an error response could be sent
     */
    sendErrorResponse(errored_packet, reply_data_func) {
        let try_local;
        let try_route;
        let try_inf;
        let src;
        if (try_local = this._l3infs.find((l3inf) => l3inf.ipv4.and(l3inf.ipv4_prefix).compare(errored_packet.src.and(l3inf.ipv4_prefix)) == 0)) {
            src = try_local.ipv4;
        }
        else if (try_route = this._routing_table?.get(errored_packet.src)) {
            src = try_route[0][1];
        }
        else if (try_inf = this._l3infs.find((inf) => inf.ipv4)) {
            src = try_inf.ipv4;
        }
        else {
            return false;
        }
        this.tryEncapsulateAndSend(new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.ICMP, src, errored_packet.src, [], reply_data_func(errored_packet).datagram));
        return true;
    }
    // TODO: create a similar function which accepts a datagram and destination and creates (and possible sends)
    // a packet with the correct source IP
    /**
     * Encapsulates and attempts to send a packet
     * @param packet The packet to encapsulate as a frame and send
     * @returns boolean indicating whether the device was able to send the packet
     */
    tryEncapsulateAndSend(packet) {
        // device has no IPv4 addresses
        if (!this._l3infs.some((inf) => inf.ipv4)) {
            return IpResponse.NET_UNREACHABLE;
        }
        // time exceeded
        if (packet.ttl <= 0) {
            this.sendErrorResponse(packet, IcmpDatagram.timeExceeded);
            return IpResponse.TIME_EXCEEDED;
        }
        // use routing table to look up routes
        const ipv4_dest = packet.dest;
        const try_route = this._routing_table?.get(ipv4_dest);
        // check if a route exists
        if (try_route && try_route.length > 0) {
            const next_hop = try_route[0][0];
            const try_egress_mac = this._arp_table.get(next_hop);
            const inf = try_egress_mac ?
                this.getL3InfFromMac(try_egress_mac[1]) ?? this.getInfFromIpv4(try_route[0][1]) :
                this.getInfFromIpv4(try_route[0][1]);
            // if the local interface exists, try sending a frame
            if (inf !== null) {
                // use the ARP table to try to get the MAC address of the next hop
                const try_mac = this._arp_table.get(next_hop);
                if (try_mac) {
                    setTimeout(() => {
                        const frame = new Frame(try_mac[0], inf.mac, EtherType.IPv4, packet.packet);
                        if (RECORDING_ON) {
                            const timestamp = performance.now();
                            RECORDED_FRAMES.push([[new DisplayFrame(frame, inf.mac, () => this.coords)], timestamp]);
                        }
                        inf.send(frame);
                    }, 10);
                    return IpResponse.SENT;
                }
                // if the MAC address is unknown, send an ARP request instead of the packet
                // destination <network/host> unreachable
                else {
                    inf.find(next_hop);
                    if (next_hop.compare(ipv4_dest) == 0) {
                        this.sendErrorResponse(packet, IcmpDatagram.hostUnreachable);
                        return IpResponse.HOST_UNREACHABLE;
                    }
                    else {
                        this.sendErrorResponse(packet, IcmpDatagram.netUnreachable);
                        return IpResponse.NET_UNREACHABLE;
                    }
                }
            }
        }
        // destination network unreachable
        this.sendErrorResponse(packet, IcmpDatagram.netUnreachable);
        return IpResponse.NET_UNREACHABLE;
    }
    tryForward(packet) {
        // this way, the received packet is returned in the ICMP error message if time exceeded
        if (packet.ttl <= 1) {
            this.sendErrorResponse(packet, IcmpDatagram.timeExceeded);
            return IpResponse.TIME_EXCEEDED;
        }
        return this.tryEncapsulateAndSend(Ipv4Packet.copyAndDecrement(packet));
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
        let forward = { value: this._allow_forwarding && true };
        let process = { value: false };
        // if this device has the frame's destination MAC address, *do not* forward the frame
        // if this device has the frame's destination MAC address, *do* process the frame
        if (this._l2infs.some((x) => x.getId().compare(frame.dest_mac) == 0) ||
            this._l3infs.some((x) => x.getId().compare(frame.dest_mac) == 0) ||
            this._loopback && this._loopback.mac.compare(frame.dest_mac) == 0) {
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
        if (!this._loopback) {
            return this._l3infs.some((x) => x.ipv4.compare(ipv4) == 0);
        }
        return this._l3infs.concat(this._loopback).some((x) => x.ipv4.compare(ipv4) == 0);
    }
    getInfFromMac(mac) {
        if (mac.compare(MacAddress.loopback) == 0) {
            return this._loopback;
        }
        return [...this._l2infs, ...this._l3infs].find((x) => x.mac.compare(mac) == 0) ?? null;
    }
    getL3InfFromMac(mac) {
        if (mac.compare(MacAddress.loopback) == 0) {
            return this._loopback;
        }
        return this._l3infs.find((x) => x.mac.compare(mac) == 0) ?? null;
    }
    getInfFromIpv4(ipv4) {
        if (this._loopback && this._loopback.ipv4.compare(ipv4) == 0) {
            return this._loopback;
        }
        return this._l3infs.find((x) => x.ipv4.compare(ipv4) == 0) ?? null;
    }
    async processFrame(frame, ingress_mac) {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);
        setTimeout(() => {
            // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
            // this should only apply to L2 infs, since L3 infs will use their ARP table instead
            // although definitely verify that this doesn't cause issues
            this.getInfFromMac(ingress_mac);
            if (this.getInfFromMac(ingress_mac)?.isL2() && !this.hasInfWithMac(frame.src_mac) && !frame.src_mac.isBroadcast() && !frame.src_mac.isLoopback()) {
                this._forwarding_table.set(frame.src_mac, ingress_mac);
            }
            // many protocols only apply to L3 devices (generalize to devices with L3 ports)
            if (should_process.value) {
                if (ethertype <= EtherType.IEEE802dot3_Upper) {
                    const length = ethertype;
                    // this.process802dot3Frame(frame, ingress_mac);
                }
                else if (ethertype == EtherType.ARP && this.hasL3Infs()) {
                    const packet = ArpPacket.parsePacket(frame.packet);
                    this.processARP(packet, ingress_mac, should_forward);
                }
                else if (ethertype == EtherType.IPv4 && this.hasL3Infs()) {
                    const packet = Ipv4Packet.parsePacket(frame.packet);
                    if (Ipv4Packet.verifyChecksum(packet)) {
                        console.log("IPv4 checksum verification succeeded!");
                        this.processIpv4(packet, ingress_mac);
                    }
                    else {
                        console.log("IPv4 checksum verification failed!");
                        should_forward.value = false;
                    }
                }
                // otherwise, drop (IPv6, others have not been implemented)
            }
        }, 0);
        setTimeout(() => {
            if (should_forward.value) {
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
        let frame_set = [];
        const timestamp = performance.now();
        for (let inf of broadcast_domain) {
            if (RECORDING_ON) {
                frame_set.push(new DisplayFrame(frame, inf.mac, () => this.coords));
            }
            await inf.send(frame);
        }
        if (RECORDING_ON && frame_set.length > 0) {
            RECORDED_FRAMES.push([frame_set, timestamp]);
        }
    }
    /**
     * Attempts to forward a frame based on its destination MAC address
     * @param frame the frame to forward
     * @param ingress_mac the MAC address of the interface on which the frame was initially received
     */
    async forward(frame, ingress_mac) {
        let egress_mac;
        const dest_mac = frame.dest_mac;
        const ingress_inf = this.getInfFromMac(ingress_mac);
        if (!ingress_inf) {
            throw Error("Interface does not exist");
        }
        // if dest_mac is broadcast, send to all non-ingress frames in the same broadcast domain
        if (dest_mac.isBroadcast()) {
            await this.broadcastInf(frame, ingress_inf);
        }
        // otherwise, if the destination MAC is in the forwarding table, forward out of that interface
        else if (this._forwarding_table.has(dest_mac) && (egress_mac = this._forwarding_table.get(dest_mac))) {
            const egress_inf = this.getInfFromMac(egress_mac);
            if (!egress_inf) {
                throw Error("Interface does not exist");
            }
            if (egress_inf.isActive()) {
                if (RECORDING_ON) {
                    const timestamp = performance.now();
                    RECORDED_FRAMES.push([[new DisplayFrame(frame, egress_inf.mac, () => this.coords)], timestamp]);
                }
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
        if (try_inf) {
            if (!merge) {
                this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            }
            if (op == OP.REQUEST) {
                should_forward.value = false;
                const arp_reply = arp_request.makeReply(try_inf.mac);
                const frame = new Frame(arp_reply.dest_ha, try_inf.mac, EtherType.ARP, arp_reply.packet);
                if (RECORDING_ON) {
                    const timestamp = performance.now();
                    RECORDED_FRAMES.push([[new DisplayFrame(frame, try_inf.mac, () => this.coords)], timestamp]);
                }
                await try_inf.send(frame);
            }
        }
    }
    async processIpv4(ipv4_packet, ingress_mac) {
        // sockets
        this._sockets.incoming(ipv4_packet.packet, SockType.RAW, ingress_mac.toString(), 0);
        // RFC 1812 5.2.1 may be used as a guide
        if (ipv4_packet.dest.isBroadcast() || this.hasInfWithIpv4(ipv4_packet.dest)) {
            switch (ipv4_packet.protocol) {
                case InternetProtocolNumbers.ICMP:
                    const icmp_datagram = IcmpDatagram.parse(ipv4_packet.data);
                    if (IcmpDatagram.verifyChecksum(icmp_datagram)) {
                        this.processICMP(icmp_datagram, ipv4_packet);
                        return true;
                    }
                    break;
                case InternetProtocolNumbers.TCP:
                    break;
                case InternetProtocolNumbers.UDP:
                    const udp_datagram = UdpDatagram.parse(ipv4_packet.data, ipv4_packet.src, ipv4_packet.dest);
                    if (UdpDatagram.verifyChecksum(udp_datagram, ipv4_packet.src, ipv4_packet.dest)) {
                        console.log("UDP checksum verification succeeded!");
                        this.processUDP(udp_datagram, ipv4_packet);
                        return true;
                    }
                    else {
                        console.log("UDP checksum verification failed!");
                    }
                    break;
            }
        }
        else if (this._allow_forwarding) {
            this.tryForward(ipv4_packet);
            return true;
        }
        return false;
    }
    async processICMP(icmp_datagram, ipv4_packet) {
        switch (icmp_datagram.type) {
            // if the datagram is an Echo Request, send a reply
            case IcmpControlMessage.ECHO_REQUEST:
                console.log(`!! ICMP Request Received!`);
                const sent = this.tryEncapsulateAndSend(new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.ICMP, ipv4_packet.dest, ipv4_packet.src, [], IcmpDatagram.echoReply(icmp_datagram).datagram));
                return sent == IpResponse.SENT;
        }
        return false;
    }
    async processUDP(udp_datagram, ipv4_packet) {
        // sockets
        this._sockets.incoming(udp_datagram.datagram, SockType.DGRAM, ipv4_packet.dest.toString(), udp_datagram.dest_port);
        return false;
    }
    logPing(datagram, packet) {
        if (datagram.isEchoReply) {
            console.log("Received reply");
        }
    }
    logError(error) {
        console.log(error);
    }
    /**
     * Applications
     */
    getL2Interfaces() {
        return this._l2infs.map((l2inf) => ({ "mac_address": l2inf.mac }));
    }
    getL3Interfaces() {
        return this._l3infs.map((l3inf) => ({ "mac_address": l3inf.mac, "ipv4_address": l3inf.ipv4, "ipv4_prefix": l3inf.ipv4_prefix }));
    }
    ping(dest_ipv4, count = Number.MAX_VALUE, ttl = 255, success_func = this.logPing, error_func = this.logError) {
        const id = this._env.has('PING_SEQ') ? parseInt(this._env.get('PING_SEQ') ?? '0') + 1 : 1;
        this._env.set('PING_SEQ', id.toString());
        let hits = 0;
        let echo_num = 1;
        (async function processEcho(device) {
            let id_str = device._env.get('PING_SEQ');
            if (id_str !== undefined && parseInt(id_str) != id) {
                return;
            }
            const start = performance.now();
            const response = await device.icmpEcho(dest_ipv4, id, echo_num++, ttl);
            const end = performance.now();
            if (response) {
                if (response[0].isEchoReply) {
                    hits++;
                }
                success_func(response[0], response[1]);
            }
            else {
                console.log(`Request timed out`);
                error_func(`Request timed out`);
            }
            if (echo_num <= count) {
                const wait_time = 1000 - (end - start);
                setTimeout(async () => await processEcho(device), Math.max(wait_time, 0));
            }
            else {
                console.log(`${hits}/${count}`);
                error_func(`${count} pings transmitted, ${hits} received`);
            }
        })(this);
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
        if (!this.hasL3Infs()) {
            return null;
        }
        const icmp_request = IcmpDatagram.echoRequest(id, seq_num);
        const packet = new Ipv4Packet(0, 0, ttl, InternetProtocolNumbers.ICMP, this._l3infs[0].ipv4, dest_ipv4, [], icmp_request.datagram);
        const start = performance.now();
        let now = start;
        this.tryEncapsulateAndSend(packet);
        const sock = new Socket(SockType.RAW);
        this._sockets.bind(sock, '*', 0);
        let match = null;
        let recv_pkt = null;
        let recv_dgram = null;
        while ((now - start < 1000) && (!recv_pkt || !recv_dgram || !IcmpDatagram.verifyIcmpEcho(packet, icmp_request, recv_pkt, recv_dgram))) {
            now = performance.now();
            match = await sock.receive(1000 - (now - start));
            if (!match) {
                this._sockets.close(sock);
                return null;
            }
            recv_pkt = Ipv4Packet.parsePacket(match);
            recv_dgram = IcmpDatagram.parse(recv_pkt.data);
        }
        this._sockets.close(sock);
        if (!recv_dgram || !recv_pkt) {
            return null;
        }
        return [recv_dgram, recv_pkt];
    }
    get dhcp_records() {
        if (this._dhcp_server) {
            return this._dhcp_server.records;
        }
        return null;
    }
    addDhcpRecord(pool_network_address, pool_prefix, router_address) {
        if (this._dhcp_server) {
            this._dhcp_server.addRecord(pool_network_address, pool_prefix, router_address);
        }
    }
    deleteDhcpRecord(pool_network_address) {
        if (this._dhcp_server) {
            this._dhcp_server.delRecord(pool_network_address);
        }
    }
    hasDhcpServer() {
        return this._dhcp_server ? true : false;
    }
    toggleDhcpClient(mac) {
        if (!this._dhcp_client) {
            return false;
        }
        else if (!this._l3infs.some((x) => x.mac.compare(mac) == 0)) {
            return false;
        }
        else if (this._dhcp_client.enabled(mac)) {
            this._dhcp_client.disable(mac);
            return true;
        }
        else {
            this._dhcp_client.enable(mac);
            return true;
        }
    }
    dhcpEnabled(mac) {
        return this._dhcp_client ? this._dhcp_client.enabled(mac) : false;
    }
}
Device.DeviceList = new IdentifiedList();
export class Libraries {
    constructor(getL2Interfaces, getL3Interfaces, icmpEcho, sendPacket, sendFrame, bind, close) {
        this.getL2Interfaces = getL2Interfaces;
        this.getL3Interfaces = getL3Interfaces;
        this.icmpEcho = icmpEcho;
        this.sendPacket = sendPacket;
        this.sendFrame = sendFrame;
        this.bind = bind;
        this.close = close;
    }
}
/**
 * Acts as a middle-man between the network interfaces and the device itself
 */
export class NetworkController {
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
    get coords() {
        return this._device.coords;
    }
}
export class PersonalComputer extends Device {
    constructor() {
        super(DeviceType.PC);
        this._dhcp_server = null;
        this._allow_forwarding = false;
        this._l3infs.push(new L3Interface(this._network_controller, 0));
        this._loopback = VirtualL3Interface.newLoopback(this._network_controller);
        this._arp_table.setLocalInfs(this._loopback, ...this._l3infs);
        this._routing_table = new RoutingTable(this._loopback.ipv4, this._l3infs[0]);
        this._dhcp_client = new DhcpClient(this._lib, (inf_mac, ipv4_address, prefix) => {
            const inf = this.getL3InfFromMac(inf_mac);
            if (inf) {
                inf.ipv4.value = [ipv4_address.value[0], ipv4_address.value[1], ipv4_address.value[2], ipv4_address.value[3]];
                inf.ipv4_prefix.value = prefix.value;
            }
        }, (default_gateway, mac_address) => { this.default_gateway = default_gateway; });
    }
    set ipv4(ipv4) {
        this._l3infs[0].ipv4.value = ipv4;
    }
    get ipv4() {
        return this._l3infs[0].ipv4;
    }
    set ipv4_prefix(ipv4_prefix) {
        this._l3infs[0].ipv4_prefix.value = ipv4_prefix;
    }
    get inf() {
        return this._l3infs[0];
    }
    set default_gateway(gateway) {
        const quad_zero = new Ipv4Address([0, 0, 0, 0]);
        const zero_prefix = new Ipv4Prefix(0);
        const try_prev_default_gateway = this._routing_table.get(quad_zero, true);
        if (try_prev_default_gateway) {
            for (const route of try_prev_default_gateway) {
                this._routing_table.delete(quad_zero, zero_prefix, route[0], route[1], 1);
            }
        }
        this._routing_table.set(quad_zero, zero_prefix, gateway, this._l3infs[0].ipv4, 1);
    }
}
export class Switch extends Device {
    constructor(num_inf) {
        super(DeviceType.SWITCH);
        this._loopback = null;
        this._routing_table = null;
        this._dhcp_client = null;
        this._dhcp_server = null;
        for (let i = 0; i < num_inf; i++) {
            this._l2infs.push(new L2Interface(this._network_controller, i));
        }
        InfMatrix.link(...this._l2infs.map((x) => x.mac));
    }
}
export class Router extends Device {
    constructor(num_inf) {
        super(DeviceType.ROUTER);
        for (let i = 0; i < num_inf; i++) {
            this._l3infs.push(new L3Interface(this._network_controller, i));
        }
        InfMatrix.link(...this._l3infs.map((x) => x.mac));
        this._loopback = VirtualL3Interface.newLoopback(this._network_controller);
        this._routing_table = new RoutingTable(this._loopback.ipv4, ...this._l3infs);
        this._arp_table.setLocalInfs(this._loopback, ...this._l3infs);
        this._dhcp_client = new DhcpClient(this._lib, (inf_mac, ipv4_address, prefix) => {
            const inf = this.getL3InfFromMac(inf_mac);
            if (inf) {
                inf.ipv4.value = [ipv4_address.value[0], ipv4_address.value[1], ipv4_address.value[2], ipv4_address.value[3]];
                inf.ipv4_prefix.value = prefix.value;
            }
        }, (default_gateway, mac_address) => { this.addDefaultRoute(default_gateway, mac_address); });
        this._dhcp_server = new DhcpServer(this._lib);
    }
    addDefaultRoute(gateway, mac_address) {
        const inf_ipv4 = this._l3infs.find((l3inf) => mac_address.compare(l3inf.mac) === 0)?.ipv4;
        if (!inf_ipv4) {
            return;
        }
        const quad_zero = Ipv4Address.quad_zero;
        const zero_prefix = new Ipv4Prefix(0);
        const try_prev_default_routes = this._routing_table.get(quad_zero, true);
        if (try_prev_default_routes) {
            for (const route of try_prev_default_routes) {
                const route_egress_mac = this._l3infs.find((l3inf) => l3inf.ipv4.compare(route[1]) == 0)?.mac;
                if (route_egress_mac && mac_address.compare(route_egress_mac) == 0) {
                    this._routing_table.delete(quad_zero, zero_prefix, route[0], route[1], 1);
                }
            }
        }
        this._routing_table.set(quad_zero, zero_prefix, gateway, inf_ipv4, 1);
    }
}
//# sourceMappingURL=device.js.map