import { Ipv4Address, Identifier, DeviceID, MacAddress, Ipv4Prefix } from "./addressing.js";
import { ArpPacket, ArpTable, OP } from "./arp.js";
import { ForwardingInformationBase } from "./forwarding.js";
import { DisplayFrame, EtherType, Frame } from "./frame.js";
import { IcmpControlMessage, IcmpDatagram } from "./icmp.js";
import { IdentifiedList, InfMatrix, L2Interface, L3Interface, VirtualL3Interface } from "./interface.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./ip.js";
import { RoutingTable } from "./routing.js";
import { Socket, SocketTable } from "./socket.js";
import { CANVAS_HEIGHT, CANVAS_WIDTH, ICON_SIZE, RECORDED_FRAMES, RECORDING_ON } from "./ui/variables.js";

export interface IdentifiedItem {
    getId(): Identifier;
    compare(other: this): number;
}

enum IpResponse { SENT, TIME_EXCEEDED, HOST_UNREACHABLE, NET_UNREACHABLE };
export enum DeviceType { PC, SERVER, ROUTER, SWITCH };

export abstract class Device implements IdentifiedItem {
    private readonly _id: DeviceID;
    private _ping_terminal_lines: string[] = [];
    private _forwarding_table: ForwardingInformationBase = new ForwardingInformationBase();
    protected _arp_table: ArpTable = new ArpTable(); /* don't keep this public */
    protected _routing_table: RoutingTable = new RoutingTable();
    protected _network_controller: NetworkController = new NetworkController(this);
    protected _env: Map<string, string> = new Map();
    protected _sockets: SocketTable = new SocketTable();
    protected abstract _loopback: VirtualL3Interface;
    protected readonly _l3infs: L3Interface[] = [];
    protected readonly _l2infs: L2Interface[] = [];
    public readonly device_type: DeviceType;
    public coords: [number, number];
    protected _allow_forwarding: boolean = true;

    private static DeviceList = new IdentifiedList<Device>();

    public constructor(device_type: DeviceType) {
        this.device_type = device_type;
        let assigned = false;
        while (!assigned) {
            const devid = DeviceID.rand();
            const device = new DeviceID(devid)
            if (!Device.DeviceList.existsId(device)) {
                assigned = true;
                this._id = device;
                Device.DeviceList.push(this);
            }
        }
    }

    public static getList(): ReadonlyArray<Device> {
        return this.DeviceList;
    }

    public static getIterator(): IterableIterator<Readonly<Device>> {
        return this.DeviceList.values();
    }

    /**
     * Adds a device to the topology
     * @param device Device to add
     * @returns The added Device
     */
    public static createDevice(device: Device, x_coord: number, y_coord: number): Device {
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
    public static connectDevices(firstDevice: Device, secondDevice: Device): boolean {
        const firstDevice_inf = [...firstDevice._l2infs, ...firstDevice._l3infs].find((x) => !InfMatrix.isConnected(x.mac));
        if (firstDevice_inf === undefined){
            console.log("first device")
        }
        const secondDevice_inf = [...secondDevice._l2infs, ...secondDevice._l3infs].find((x) => !InfMatrix.isConnected(x.mac));
        if (secondDevice_inf === undefined){
            console.log("second device")
        }
        if (firstDevice_inf !== undefined && secondDevice_inf !== undefined) {
            InfMatrix.connect(firstDevice_inf.mac, secondDevice_inf.mac);
            return true;
        }
        return false;
    }

    public static moveDevice(device: Device, new_x_coord: number, new_y_coord: number) {
        device.coords = [new_x_coord / CANVAS_WIDTH(), new_y_coord / CANVAS_HEIGHT()];
    }

    public static existsDevice(x_coord: number, y_coord: number): boolean {
        return this.DeviceList.some((dev) =>
            Math.abs(dev.coords[0] * CANVAS_WIDTH() - x_coord) <= ICON_SIZE/2 &&
            Math.abs(dev.coords[1] * CANVAS_HEIGHT() - y_coord) <= ICON_SIZE/2
        );
    }

    public static getDevice(x_coord: number, y_coord: number): Device {
        return this.DeviceList.find((dev) =>
            Math.abs(dev.coords[0] * CANVAS_WIDTH() - x_coord) <= ICON_SIZE/2 &&
            Math.abs(dev.coords[1] * CANVAS_HEIGHT() - y_coord) <= ICON_SIZE/2
        );
    }

    public static getDeviceFromId(id: number): Device {
        return this.DeviceList.itemFromId(new DeviceID(id));
    }

    /**
     * Deletes a device from the topology
     * @param x_coord X-axis coordinate of the device to delete
     * @param y_coord Y-axis coordinate of the device to delete
     * @returns boolean indicating whether a device at the given coordinates existed and was deleted
     */
    public static deleteDevice(x_coord: number, y_coord: number): boolean {
        const device = this.getDevice(x_coord, y_coord);
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

    /**
     * Deletes all devices and their interfaces
     */
    public static clearTopology() {
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

    public static get numOfDevices(): number {
        return this.DeviceList.length;
    }

    public get ping_terminal_lines(): Readonly<string[]> {
        return this._ping_terminal_lines;
    }

    public get l2infs(): L2Interface[] {
        return this._l2infs;
    }

    public get l3infs(): L3Interface[] {
        return this._l3infs;
    }

    public getId(): Readonly<DeviceID> {
        return this._id;
    }

    public compare(other: this): number {
        return this._id.compare(other._id);
    }

    public pushPingLine(line: string) {
        this._ping_terminal_lines.push(line);
    }
    public clearPingTerminal() {
        this._ping_terminal_lines = [];
    }

    public clearFib(mac: MacAddress) {
        if (!this.hasInfWithMac(mac)) {
            throw Error(`Device does not have MAC address ${mac}`);
        }
        this._forwarding_table.clearValue(mac);
        this._arp_table.clearValue(mac);
    }

    public getAllRoutes = () => this._routing_table.getAllRoutes();
    public setRoute(dest_ipv4: Ipv4Address, dest_prefix: Ipv4Prefix, remote_gateway: Ipv4Address, local_inf: Ipv4Address, administrative_distance: number): boolean {
        return this._routing_table.set(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance);
    }
    public deleteRoute(dest_ipv4: Ipv4Address, dest_prefix: Ipv4Prefix, remote_gateway: Ipv4Address, local_inf: Ipv4Address, administrative_distance: number): boolean {
        return this._routing_table.delete(dest_ipv4, dest_prefix, remote_gateway, local_inf, administrative_distance);
    }

    /**
     * Determines the IPv4 address to use as the source for an IP error message and sends the error message
     * @param errored_packet received packet which could not be sent
     * @param reply_data_func function which uses the received packet to generate a specific ICMP debug message
     * @returns boolean indicating whether an error response could be sent
     */
    private sendErrorResponse(errored_packet: Ipv4Packet, reply_data_func: (Ipv4Packet) => IcmpDatagram): boolean {
        let try_local;
        let try_route;
        let try_inf;
        let src: Ipv4Address;

        if (try_local = this._l3infs.find((l3inf) => l3inf.ipv4.and(l3inf.ipv4_prefix).compare(errored_packet.src.and(l3inf.ipv4_prefix)) == 0)) {
            src = try_local.ipv4;
        }
        else if (try_route = this._routing_table.get(errored_packet.src)) {
            src = try_route[0][1];
        }
        else if (try_inf = this._l3infs.find((inf) => inf.ipv4)) {
            src = try_inf.ipv4;
        }
        else {
            return false;
        }

        this.tryEncapsulateAndSend(new Ipv4Packet(
            0, 0, 64, InternetProtocolNumbers.ICMP, src, errored_packet.src, [],
            reply_data_func(errored_packet).datagram
        ));
        return true;
    }

    /**
     * Encapsulates and attempts to send a packet
     * @param packet The packet to encapsulate as a frame and send
     * @returns boolean indicating whether the device was able to send the packet
     */
    private tryEncapsulateAndSend(packet: Ipv4Packet): IpResponse {
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
        const try_route = this._routing_table.get(ipv4_dest);
        // check if a route exists
        if (try_route !== undefined && try_route.length > 0) {
            const next_hop = try_route[0][0];
            const try_egress_mac = this._arp_table.get(next_hop);
            const inf: L3Interface = try_egress_mac !== undefined ?
                                     this.getL3InfFromMac(try_egress_mac[1]) ?? this.getInfFromIpv4(try_route[0][1]) :
                                     this.getInfFromIpv4(try_route[0][1]);
            // if the local interface exists, try sending a frame
            if (inf !== undefined) {
                // use the ARP table to try to get the MAC address of the next hop
                const try_mac = this._arp_table.get(next_hop);
                if (try_mac !== undefined) {
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

    private tryForward(packet: Ipv4Packet): IpResponse {
        // this way, the received packet is returned in the ICMP error message if time exceeded
        if (packet.ttl <= 1) {
            this.sendErrorResponse(packet, IcmpDatagram.timeExceeded);
            return IpResponse.TIME_EXCEEDED;
        }
        return this.tryEncapsulateAndSend(Ipv4Packet.copyAndDecrement(packet));
    }

    public hasL2Infs(): boolean {
        return this._l2infs.length > 0;
    }

    public hasL3Infs(): boolean {
        return this._l3infs.length > 0;
    }

    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans within an object for whether to process and whether to forward the frame, respectively.
     * The object wrapper allows each object to be passed by reference to other functions.
     */
    private analyze(frame: Frame): [{value: boolean}, {value: boolean}] {
        let forward = {value: this._allow_forwarding && true};
        let process = {value: false};

        // if this device has the frame's destination MAC address, *do not* forward the frame
        // if this device has the frame's destination MAC address, *do* process the frame
        if (
            this._l2infs.some((x) => x.getId().compare(frame.dest_mac) == 0) ||
            this._l3infs.some((x) => x.getId().compare(frame.dest_mac) == 0) ||
            this._loopback && this._loopback.mac.compare(frame.dest_mac) == 0
        ) {
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
        return this._l3infs.concat(this._loopback).some((x) => x.ipv4.compare(ipv4) == 0);
    }

    private getInfFromMac(mac: MacAddress): L2Interface | L3Interface {
        if (mac.compare(MacAddress.loopback) == 0) {
            return this._loopback;
        }
        return [...this._l2infs, ...this._l3infs].find((x) => x.mac.compare(mac) == 0);
    }

    private getL3InfFromMac(mac: MacAddress): L3Interface {
        if (mac.compare(MacAddress.loopback) == 0) {
            return this._loopback;
        }
        return this._l3infs.find((x) => x.mac.compare(mac) == 0);
    }

    private getInfFromIpv4(ipv4: Ipv4Address): L3Interface {
        if (this._loopback && this._loopback.ipv4.compare(ipv4) == 0) {
            return this._loopback;
        }
        return this._l3infs.find((x) => x.ipv4.compare(ipv4) == 0);
    }

    public async processFrame(frame: Frame, ingress_mac: MacAddress): Promise<boolean> {
        const ethertype = frame.ethertype;
        const [should_process, should_forward] = this.analyze(frame);

        setTimeout(() => {
            // add the frame source to the FIB as long as it isn't from the same device, or from an invalid MAC (broadcast)
            // this should only apply to L2 infs, since L3 infs will use their ARP table instead
            // although definitely verify that this doesn't cause issues
            this.getInfFromMac(ingress_mac)
            if (this.getInfFromMac(ingress_mac).isL2() && !this.hasInfWithMac(frame.src_mac)  && !frame.src_mac.isBroadcast() && !frame.src_mac.isLoopback()) {
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
                        console.log("IPv4 checksum verification succeeded!")
                        this.processIpv4(packet, ingress_mac);
                    }
                    else {
                        console.log("IPv4 checksum verification failed!")
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

    private async broadcastInf(frame: Frame, ingress_inf: L2Interface | L3Interface) {
        if (ingress_inf === undefined) {
            throw Error("Interface does not exist");
        }
        // valid interfaces are up (on and connected to), not the same as the ingress, and have the same VLAN as the ingress
        const broadcast_domain = this._l2infs.filter((x) => x.isActive() && x.mac.compare(ingress_inf.mac) != 0 && x.vlan == ingress_inf.vlan);
        let frame_set: DisplayFrame[] = [];
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
                should_forward.value = false
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

    private async processIpv4(ipv4_packet: Ipv4Packet, ingress_mac): Promise<boolean> {
        // RFC 1812 5.2.1 may be used as a guide
        if (this.hasInfWithIpv4(ipv4_packet.dest)) {
            switch (ipv4_packet.protocol) {
                case InternetProtocolNumbers.ICMP:
                    const icmp_datagram = IcmpDatagram.parse(ipv4_packet.data);
                    if (IcmpDatagram.verifyChecksum(icmp_datagram)) {
                        console.log("ICMP checksum verification succeeded!")
                        this.processICMP(icmp_datagram, ipv4_packet);
                        return true;
                    }
                    else {
                        console.log("ICMP checksum verification failed!");
                    }
                    break;
                case InternetProtocolNumbers.TCP:
                    break;
                case InternetProtocolNumbers.UDP:
                    break;
            }
        }
        else if (this._allow_forwarding) {
            this.tryForward(ipv4_packet);
            return true;
        }
        return false;
    }

    private async processICMP(icmp_datagram: IcmpDatagram, ipv4_packet: Ipv4Packet): Promise<boolean> {
        // check for any sockets
        for (let icmp_socket of this._sockets.getIcmpSockets()) {
            const matched = icmp_socket.check(icmp_datagram, ipv4_packet);
            console.log(`---------- checking socket: ${matched} ----------`);
            // one packet can only match one socket
            if (matched) {
                break;
            }
        }
        switch (icmp_datagram.type) {
            // if the datagram is an Echo Request, send a reply
            case IcmpControlMessage.ECHO_REQUEST:
                console.log(`!! ICMP Request Received!`);
                const sent = this.tryEncapsulateAndSend(new Ipv4Packet(
                    0, 0, 64, InternetProtocolNumbers.ICMP, ipv4_packet.dest, ipv4_packet.src, [],
                    IcmpDatagram.echoReply(icmp_datagram).datagram
                ));
                return sent == IpResponse.SENT;
            // Note: no packet will be forwarded if it's an Echo Reply
            // (so this block can be deleted later)
            case IcmpControlMessage.ECHO_REPLY:
                console.log(`!! ICMP Reply Received! (there are ${this._sockets.getIcmpSockets().size} sockets)`)
                return false;
        }
        return false;
    }

    private logPing(datagram: IcmpDatagram, packet: Ipv4Packet) {
        if (datagram.isEchoReply) {
            console.log("Received reply");
        }
    }
    private logError(error: string) {
        console.log(error)
    }

    public ping(dest_ipv4: Ipv4Address, count: number = Number.MAX_VALUE, ttl: number = 255, success_func: (IcmpDatagram, Ipv4Packet) => void = this.logPing, error_func: (string) => void = this.logError) {
        const id = this._env.has('PING_SEQ') ? parseInt(this._env.get('PING_SEQ')) + 1 : 1;
        this._env.set('PING_SEQ', id.toString());
        
        let hits = 0;
        let echo_num = 1;

        (async function processEcho(device: Device) {
            let id_str = device._env.get('PING_SEQ');
            if (id_str !== undefined && parseInt(id_str) != id) {
                return;
            }
            const start = performance.now();
            const response: [IcmpDatagram, Ipv4Packet] = await device.icmpEcho(dest_ipv4, id, echo_num++, ttl);
            const end = performance.now();
            if (response !== undefined) {
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
                const wait_time: number = 1000 - (end-start);
                setTimeout(async () => await processEcho(device), Math.max(wait_time, 0));
            }
            else {
                console.log(`${hits}/${count}`)
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
    public async icmpEcho(dest_ipv4: Ipv4Address, id: number = 1, seq_num: number = 1, ttl: number = 255): Promise<[IcmpDatagram,Ipv4Packet]> {
        return new Promise((resolve) => {
            if (this.hasL3Infs()) {
                const icmp_request = IcmpDatagram.echoRequest(id, seq_num);
                const packet = new Ipv4Packet(
                    0, 0, ttl, InternetProtocolNumbers.ICMP, this._l3infs[0].ipv4, dest_ipv4, [], icmp_request.datagram
                );
                this.tryEncapsulateAndSend(packet)
                let start = performance.now();
                const ping_socket = Socket.icmpSocketFrom(icmp_request, packet);
                this._sockets.addIcmpSocket(ping_socket);
                console.log(`----------- socket ${seq_num} added ----------`)
                let i = 0;
                const interval_length = 100;

                const interval = setInterval(() => {
                    const datagram_received = ping_socket.hits > 0;
                    const timed_out = i >= 1000/interval_length - 1;
                    if (datagram_received || timed_out) {
                        this._sockets.deleteIcmpSocket(ping_socket);
                        clearInterval(interval);
                        console.log(`---------- socket ${seq_num} deleted ---------`)
                        if (datagram_received) {
                            let end = performance.now();
                            const [datagram,packet] = ping_socket.matched_top;
                            console.log(`received ICMP ${IcmpControlMessage[datagram.type]} in ${end - start}`);
                            resolve([datagram,packet]);
                            return;
                        }
                        else if (timed_out) {
                            resolve(undefined);
                            return;
                        }
                    }
                    i++;
                }, interval_length);
            }
            else {
                resolve(undefined);
            }
        })
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

    public get coords(): [number, number] {
        return this._device.coords;
    }
}

export class PersonalComputer extends Device {
    protected readonly _loopback: VirtualL3Interface = VirtualL3Interface.newLoopback(this._network_controller);

    public constructor() {
        super(DeviceType.PC);
        this._allow_forwarding = false;
        this._l3infs.push(new L3Interface(this._network_controller, 0));

        this._arp_table.setLocalInfs(this._loopback, ...this._l3infs);
        this._routing_table.setLocalInfs(this._loopback.ipv4, ...this._l3infs);
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
        return this._l3infs[0];
    }

    public set default_gateway(gateway: [number, number, number, number]) {
        this._routing_table.set(
            new Ipv4Address([0,0,0,0]),
            new Ipv4Prefix(0),
            new Ipv4Address(gateway),
            this._l3infs[0].ipv4,
            1
        )
    }
}

export class Switch extends Device {
    protected readonly _loopback: VirtualL3Interface = undefined;

    public constructor(num_inf: number) {
        super(DeviceType.SWITCH);
        for (let i = 0; i < num_inf; i++) {
            this._l2infs.push(new L2Interface(this._network_controller, i));
        }
        InfMatrix.link(...this._l2infs.map((x) => x.mac));
    }
}

export class Router extends Device {
    protected readonly _loopback: VirtualL3Interface = VirtualL3Interface.newLoopback(this._network_controller);

    public constructor(num_inf: number) {
        super(DeviceType.ROUTER);
        for (let i = 0; i < num_inf; i++) {
            this._l3infs.push(new L3Interface(this._network_controller, i));
        }
        InfMatrix.link(...this._l3infs.map((x) => x.mac));

        this._arp_table.setLocalInfs(this._loopback, ...this._l3infs);
        this._routing_table.setLocalInfs(this._loopback.ipv4, ...this._l3infs);
    }
}