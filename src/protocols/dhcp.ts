import { concat, divide, Ipv4Address, Ipv4Prefix, MacAddress, spread } from "../addressing.js";
import { Libraries } from "../device.js";
import { EtherType, Frame } from "../frame.js";
import { Socket } from "../socket.js";
import { HTYPE } from "./arp.js";
import { IcmpControlMessage, IcmpDatagram } from "./icmp.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./ip.js";
import { UdpDatagram } from "./udp.js";

enum DhcpOptions {
    SUBNET_MASK = 1, TIME_OFFSET, ROUTER, TIME_SERVER, NAME_SERVER, DOMAIN_NAME_SERVER,
    LEASE_TIME = 51,
    MESSAGE_TYPE = 53,
    PARAMETER_REQUEST_LIST = 55
};
enum DhcpMessageType {
    DHCPDISCOVER = 1, DHCPOFFER, DHCPREQUEST, DHCPDECLINE, DHCPACK, DHCPNACK, DHCPRELEASE, DHCPINFORM
}

export class DhcpServer {
    private readonly lib: Libraries;
    private _enabled: boolean;
    private _network: Ipv4Address = null;
    private _prefix: Ipv4Prefix = null;
    private _router: Ipv4Address = null;
    private sock: Socket<UdpDatagram>;

    private offers_given_mac = new Map<string, Ipv4Address>();
                                    // MAC     IPv4
    private offers_given_ipv4 = new Set<Ipv4Address>();

    private readonly LEASE_TIME = 86400; // currently not enforced
    private readonly OFFER_TIMEOUT = 30000;
    public static readonly PORT = 67;

    public constructor(lib: Libraries) {
        this.lib = lib;
        this.sock = Socket.udpSocket(Ipv4Address.broadcast, DhcpServer.PORT);
    }

    public set network(network: Ipv4Address) {
        this._network = network;
    }

    public set prefix(prefix: Ipv4Prefix) {
        this._prefix = prefix;
        this._network = this._network.and(this._prefix);
    }

    public set router(default_router: Ipv4Address) {
        this._router = default_router;
    }

    public enable() {
        this._enabled = true;
        this.lib.bindUDP(this.sock);

        setTimeout(() => {
            this.listen();
        }, 0);
    }

    public disable() {
        this._enabled = false;
        this.offers_given_mac.clear();
        this.offers_given_ipv4.clear();

        this.sock.kill();
        this.lib.closeUDP(this.sock);
    }

    private async listen() {
        while (this._enabled) {
            const req = await this.sock.receive(5000);
            if (req && req[0].data) {
                const request: DhcpPayload = DhcpPayload.parse(req[0].data);
                if (request.op == OP.BOOTREQUEST && request.options.has(DhcpOptions.MESSAGE_TYPE)) {
                    const message_type = request.options.get(DhcpOptions.MESSAGE_TYPE)[1][0];
                    if (message_type == DhcpMessageType.DHCPDISCOVER) {
                        setTimeout(() => {
                            this.dhcpOffer(request);
                        }, 0)
                    }
                    else if (message_type == DhcpMessageType.DHCPREQUEST) {
                        setTimeout(() => {
                            this.dhcpAcknowledge(request);
                        }, 0)
                    }
                }
            }
        }
    }

    private async dhcpOffer(request: DhcpPayload) {
        const chaddr_arr: Uint8Array = request.chaddr.slice(0,6);
        const chaddr = new MacAddress([
            chaddr_arr[0], chaddr_arr[1], chaddr_arr[2],
            chaddr_arr[3], chaddr_arr[4], chaddr_arr[5]
        ]);

        const ip_and_mac = this.findServerIpv4AndMac();
        if (!ip_and_mac) {
            return;
        }
        const [server_ip, server_mac] = ip_and_mac;

        const offered_ipv4 = await this.findAvailableIpAddress(server_ip);
        if (!offered_ipv4) {
            return;
        }

        // TODO: a check should be performed before including subnet mask, router in offer
        // (this also applies for the ack)
        const offer = DhcpPayload.dhcpOffer(request.xid, chaddr, offered_ipv4, server_ip, this._prefix.mask, this._router);
        const offer_frame = this.createFrame(offer, chaddr, server_mac, server_ip, offered_ipv4);
        console.log(`DHCP-SVR: SENDING OFFER`)
        this.lib.sendFrame(offer_frame, server_mac);

        this.offers_given_mac.set(chaddr.toString(), offered_ipv4);
        this.offers_given_ipv4.add(offered_ipv4);
        setTimeout(() => {
            const chaddr_str = chaddr.toString();
            if (this.offers_given_mac.has(chaddr_str)) {
                this.offers_given_mac.delete(chaddr_str);
            }
            if (this.offers_given_ipv4.has(offered_ipv4)) {
                this.offers_given_ipv4.delete(offered_ipv4);
            }
            }, this.OFFER_TIMEOUT);
    }

    private dhcpAcknowledge(dhcp_payload: DhcpPayload) {
        const chaddr_arr: Uint8Array = dhcp_payload.chaddr.slice(0,6);
        const chaddr = new MacAddress([
            chaddr_arr[0], chaddr_arr[1], chaddr_arr[2],
            chaddr_arr[3], chaddr_arr[4], chaddr_arr[5]
        ]);

        const chaddr_str = chaddr.toString();
        if (this.offers_given_mac.has(chaddr_str)) {
            const ip_and_mac = this.findServerIpv4AndMac();
            if (!ip_and_mac) {
                return;
            }
            const [server_ip, server_mac] = ip_and_mac;


            const offered_ipv4 = this.offers_given_mac.get(chaddr_str);

            // send ack
            const ack = DhcpPayload.dhcpAck(dhcp_payload.xid, this.LEASE_TIME, chaddr, offered_ipv4, server_ip, this._prefix.mask, this._router);
            const ack_frame = this.createFrame(ack, chaddr, server_mac, server_ip, offered_ipv4);
            console.log(`DHCP-SVR: SENDING ACK`)
            this.lib.sendFrame(ack_frame, server_mac);

            this.offers_given_mac.delete(chaddr_str);
        }
    }

    private findServerIpv4AndMac(): [Ipv4Address, MacAddress] {
        const server_ip = this.lib.getIpv4Addresses().find((pair) => pair[0].and(pair[1]).compare(this._network) == 0);
        if (!server_ip || !server_ip[0]) {
            return undefined;
        }
        const server_mac = this.lib.getMacFromIpv4(server_ip[0]);
        if (!server_mac) {
            return undefined;
        }
        return [server_ip[0], server_mac];
    }

    private async findAvailableIpAddress(server_ip: Ipv4Address): Promise<Ipv4Address> {
        let try_ip = this._network.inc();
        for (; try_ip.compare(this._network.broadcastAddress(this._prefix)) != 0; try_ip = try_ip.inc()) {
            if (this.offers_given_ipv4.has(try_ip)) {
                continue;
            }

            const ping = IcmpDatagram.echoRequest(1, 1);
            const ping_pkt = new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.ICMP, server_ip, try_ip, [], ping.datagram);
            const sock = Socket.icmpSocketFrom(ping, ping_pkt);
            this.lib.bindICMP(sock);

            let resp0, resp1: [IcmpDatagram, Ipv4Packet] = undefined;
            this.lib.sendPacket(ping_pkt);
            resp0 = await sock.receive(1000);
            this.lib.sendPacket(ping_pkt);
            resp1 = await sock.receive(1000);

            this.lib.closeICMP(sock);
            if ((!resp0 && !resp1) || ((resp0 && resp0[0].type != IcmpControlMessage.ECHO_REPLY) && (resp1 && resp1[0].type != IcmpControlMessage.ECHO_REPLY))) {
                return try_ip;
            }
        }
        return undefined;
    }

    private createFrame(dhcp_payload: DhcpPayload, client_mac: MacAddress, server_mac: MacAddress, server_ip: Ipv4Address, client_ip: Ipv4Address): Frame {
        const discoverDatagram: UdpDatagram = new UdpDatagram(server_ip, client_ip, DhcpServer.PORT, DhcpClient.PORT, dhcp_payload.payload);
        const discoverPacket: Ipv4Packet = new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.UDP, server_ip, new Ipv4Address([0,0,0,0]), [], discoverDatagram.datagram);
        return new Frame(client_mac, server_mac, EtherType.IPv4, discoverPacket.packet);
    }
}

export class DhcpClient {
    private readonly lib: Libraries;
    private setIpAndPrefix: (inf_mac: MacAddress, ipv4_address: Ipv4Address, prefix: Ipv4Prefix) => void;
    private setDefaultGateway: (default_gateway: Ipv4Address) => void;

    private active_sockets = new Map<string, Socket<UdpDatagram>>();

    private killed = new Set<MacAddress>();

    private readonly POLL_LEN = 5000;
    public static readonly PORT = 68;

    public constructor(
        lib: Libraries,
        setIpAndPrefix: (inf_mac: MacAddress, ipv4_address: Ipv4Address, prefix: Ipv4Prefix) => void,
        setDefaultGateway: (default_gateway: Ipv4Address) => void
    ) {
        this.lib = lib;
        this.setIpAndPrefix = setIpAndPrefix;
        this.setDefaultGateway = setDefaultGateway;
    }

    public async disable(egress_mac: MacAddress) {
        this.killed.add(egress_mac);
        const mac_str = egress_mac.toString();
        if (this.active_sockets.has(mac_str)) {
            this.active_sockets.get(mac_str).kill();
        }

        setTimeout(() => {
            this.killed.delete(egress_mac);
        }, this.POLL_LEN);
    }

    // should probably split this into functions...
    public async enable(egress_mac: MacAddress) {
        let found = false;
        const mac_str = egress_mac.toString();

        // all sockets for a single device are identical -->
        // this will cause issues if DHCP is enabled simultaneously on multiple interfaces
        const sock: Socket<UdpDatagram> = Socket.udpSocket(Ipv4Address.broadcast, DhcpClient.PORT);
        this.active_sockets.set(mac_str, sock);

        this.lib.bindUDP(sock);
        while (!found && !this.killed.has(egress_mac)) {
            const xid = Math.trunc(Math.random() * (2**32));

            const discoverPayload: DhcpPayload = DhcpPayload.dhcpDiscover(xid, egress_mac);
            const discoverFrame = this.createFrame(discoverPayload, egress_mac);

            console.log(`DHCP-CLT: SENDING DISCOVER`)
            this.lib.sendFrame(discoverFrame, egress_mac);
            const resp = await sock.receive(this.POLL_LEN);
            if (resp && resp[0].data) {
                const offer_payload = DhcpPayload.parse(resp[0].data);
                if (offer_payload.op != OP.BOOTREPLY || offer_payload.xid != xid) {
                    continue;
                }
                found = true;
                let acknowledged = false;

                const requestPayload: DhcpPayload = DhcpPayload.dhcpRequest(xid, egress_mac, offer_payload.siaddr);
                const requestFrame: Frame = this.createFrame(requestPayload, egress_mac);

                while (!acknowledged && !this.killed.has(egress_mac)) {
                    console.log(`DHCP-CLT: SENDING REQUEST`)
                    this.lib.sendFrame(requestFrame, egress_mac);
                    const ack = await sock.receive(this.POLL_LEN);
                    if (ack && ack[0].data)
                    {
                        const ack_payload = DhcpPayload.parse(ack[0].data);
                        if (
                            ack_payload.op == OP.BOOTREPLY &&
                            ack_payload.xid == xid &&
                            ack_payload.options.has(DhcpOptions.MESSAGE_TYPE) &&
                            ack_payload.options.get(DhcpOptions.MESSAGE_TYPE)[1][0] == DhcpMessageType.DHCPACK &&
                            ack_payload.options.has(DhcpOptions.SUBNET_MASK) &&
                            ack_payload.options.get(DhcpOptions.SUBNET_MASK)[0] == 4
                        ) {
                            acknowledged = true;
                            const subnet_mask = ack_payload.options.get(DhcpOptions.SUBNET_MASK)[1];
                            // TODO: put this in its own function
                            let prefix_len = 0;
                            for (const octet of subnet_mask) {
                                const host_bits = Math.log2(0xff - octet + 1);
                                if (octet == 0xff) {
                                    prefix_len += 8;
                                }
                                else if (octet == 0x00) {
                                    break;
                                }
                                else if (octet < 0xff && Number.isInteger(host_bits)) {
                                    prefix_len += 8 - host_bits;
                                    break;
                                }
                                // on error, set prefix length to 32
                                else {
                                    prefix_len = 32;
                                    break;
                                }
                            }
                            this.setIpAndPrefix(egress_mac, ack_payload.yiaddr, new Ipv4Prefix(prefix_len));

                            if (ack_payload.options.has(DhcpOptions.ROUTER) && ack_payload.options.get(DhcpOptions.ROUTER)[0] == 4) {
                                const router: Uint8Array = ack_payload.options.get(DhcpOptions.ROUTER)[1];
                                this.setDefaultGateway(new Ipv4Address([router[0], router[1], router[2], router[3]]));
                            }
                        }
                    }
                }
            }
        }
        this.lib.closeUDP(sock);
        if (this.active_sockets.has(mac_str)) {
            this.active_sockets.delete(mac_str);
        }
    }

    private createFrame(dhcp_payload: DhcpPayload, client_mac: MacAddress): Frame {
        const empty_ip = new Ipv4Address([0,0,0,0]);
        const discoverDatagram: UdpDatagram = new UdpDatagram(empty_ip, Ipv4Address.broadcast, DhcpClient.PORT, DhcpServer.PORT, dhcp_payload.payload);
        const discoverPacket: Ipv4Packet = new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.UDP, empty_ip, Ipv4Address.broadcast, [], discoverDatagram.datagram);
        return new Frame(MacAddress.broadcast, client_mac, EtherType.IPv4, discoverPacket.packet);
    }
}

enum OP { BOOTREQUEST = 1, BOOTREPLY };

class DhcpPayload {
    readonly op: OP;
    readonly htype: HTYPE;
    readonly hlen: number = MacAddress.byteLength;
    readonly hops: number;
    readonly xid: number;
    readonly secs: number;
    readonly flags: number;
    readonly ciaddr: Ipv4Address;
    readonly yiaddr: Ipv4Address;
    readonly siaddr: Ipv4Address;
    readonly giaddr: Ipv4Address;
    readonly chaddr: Uint8Array = new Uint8Array(16);
    readonly sname: Uint8Array = new Uint8Array(64);
    readonly file: Uint8Array = new Uint8Array(128);
    readonly magic_cookie = new Uint8Array([99, 130, 83, 99]);
    readonly options: Map<number, [number, Uint8Array]>;
                      //  type     length  value

    private static readonly _lengths: number[] = [
        8, 8, 8, 8, 32, 16, 16,
        8, 8, 8, 8, // ciaddr
        8, 8, 8, 8, // yiaddr
        8, 8, 8, 8, // siaddr
        8, 8, 8, 8, // giaddr
        8, 8, 8, 8, 8, 8, 80, // chaddr
    ];
    private static readonly _bytes_before_sname = 44;
    private static readonly _bytes_before_data = 240; // TODO: verify this constant
    readonly payload: Uint8Array;

    // can make public if needed
    private constructor(op: OP, htype: HTYPE, hops: number, xid: number, secs: number, flags: number,
        ciaddr: Ipv4Address, yiaddr: Ipv4Address, siaddr: Ipv4Address, giaddr: Ipv4Address,
        chaddr: MacAddress, options: Map<number, [number, Uint8Array]> = new Map(),
        sname: Uint8Array = new Uint8Array(64), file: Uint8Array = new Uint8Array(128)
    ) {
        this.op = op;
        this.htype = htype;
        this.hops = hops;
        this.xid = xid;
        this.secs = secs;
        this.flags = flags;
        this.ciaddr = ciaddr;
        this.yiaddr = yiaddr;
        this.siaddr = siaddr;
        this.giaddr = giaddr;
        for (let i=0; i<6; i++) {
            this.chaddr[i] = chaddr.value[i];
        }
        this.options = options;
        sname.slice(0,64).forEach((i, octet) => this.sname[i] = octet);
        file.slice(0,128).forEach((i, octet) => this.file[i] = octet);

        let options_bytes: number[] = [];
        if (this.options.has(DhcpOptions.MESSAGE_TYPE)) {
            const message_type = this.options.get(DhcpOptions.MESSAGE_TYPE);
            options_bytes.push(DhcpOptions.MESSAGE_TYPE, message_type[0], message_type[1][0]);
        }
        for (const [type, option] of this.options.entries()) {
            if (type == DhcpOptions.MESSAGE_TYPE) {
                continue;
            }
            options_bytes.push(type, option[0]);
            for (const octet of option[1]) {
                options_bytes.push(octet);
            }
        }
        if (options_bytes.length > 0) {
            options_bytes.push(0xff);
        }

        this.payload = concat(
            new Uint8Array(spread(
                [this.op, DhcpPayload._lengths[0]], [this.htype, DhcpPayload._lengths[1]],
                [this.hlen, DhcpPayload._lengths[2]], [this.hops, DhcpPayload._lengths[3]],
                [this.xid, DhcpPayload._lengths[4]],
                [this.secs, DhcpPayload._lengths[5]], [this.flags, DhcpPayload._lengths[6]]
            )),
            this.ciaddr.value, this.yiaddr.value, this.siaddr.value, this.giaddr.value,
            this.chaddr,
            this.sname,
            this.file,
            this.magic_cookie,
            new Uint8Array(options_bytes)
        );
    }

    public static dhcpDiscover(xid: number, client_mac: MacAddress): DhcpPayload {
        const empty_ip = new Ipv4Address([0,0,0,0]);

        let options = new Map<number, [number,Uint8Array]>();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPDISCOVER])]);
        options.set(DhcpOptions.PARAMETER_REQUEST_LIST, [2, new Uint8Array([DhcpOptions.SUBNET_MASK, DhcpOptions.ROUTER])]);

        return new DhcpPayload(
            OP.BOOTREQUEST, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000,
            empty_ip, empty_ip, empty_ip, empty_ip,
            client_mac,
            options
        )
    }

    public static dhcpRequest(xid: number, client_mac: MacAddress, server_ipv4: Ipv4Address) {
        const empty_ip = new Ipv4Address([0,0,0,0]);

        let options = new Map<number, [number,Uint8Array]>();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPREQUEST])]);
        options.set(DhcpOptions.PARAMETER_REQUEST_LIST, [2, new Uint8Array([DhcpOptions.SUBNET_MASK, DhcpOptions.ROUTER])]);

        return new DhcpPayload(
            OP.BOOTREQUEST, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000,
            empty_ip, empty_ip, server_ipv4, empty_ip,
            client_mac,
            options
        )
    }

    public static dhcpOffer(xid: number, client_mac: MacAddress, your_ipv4: Ipv4Address, server_ipv4: Ipv4Address, subnet_mask: Ipv4Address = null, router: Ipv4Address = null) {
        const empty_ip = new Ipv4Address([0,0,0,0]);

        let options = new Map<number, [number,Uint8Array]>();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPOFFER])]);
        if (subnet_mask) {
            options.set(DhcpOptions.SUBNET_MASK, [4, subnet_mask.value]);
        }
        if (router) {
            options.set(DhcpOptions.ROUTER, [4, router.value]);
        }

        return new DhcpPayload(
            OP.BOOTREPLY, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000,
            empty_ip, your_ipv4, server_ipv4, empty_ip,
            client_mac,
            options
        )
    }

    public static dhcpAck(xid: number, lease_time: number, client_mac: MacAddress, your_ipv4: Ipv4Address, server_ipv4: Ipv4Address, subnet_mask: Ipv4Address = null, router: Ipv4Address = null) {
        const empty_ip = new Ipv4Address([0,0,0,0]);

        let options = new Map<number, [number,Uint8Array]>();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPACK])]);
        options.set(DhcpOptions.LEASE_TIME, [4, new Uint8Array(spread([lease_time, 32]))]);
        if (subnet_mask) {
            options.set(DhcpOptions.SUBNET_MASK, [4, subnet_mask.value]);
        }
        if (router) {
            options.set(DhcpOptions.ROUTER, [4, router.value]);
        }

        return new DhcpPayload(
            OP.BOOTREPLY, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000,
            empty_ip, your_ipv4, server_ipv4, empty_ip,
            client_mac,
            options
        )
    }

    public static parse(payload: Uint8Array): DhcpPayload {
        const divided = divide(payload.slice(0, DhcpPayload._bytes_before_sname), DhcpPayload._lengths);
        const options_bytes = payload.slice(DhcpPayload._bytes_before_data);

        let options = new Map<number, [number, Uint8Array]>();
        for (let i=0; i<options_bytes.length;) {
            const type = options_bytes[i];

            if (type == 0x00) {
                continue;
            }
            if (type == 0xff) {
                break;
            }

            const len = options_bytes[i+1];
            let value = new Uint8Array(len);
            for (let j=0; j<len; j++) {
                value[j] = options_bytes[i+2+j];
            }
            options.set(type, [len, value]);

            i += 2+len;
        }

        return new DhcpPayload(
            divided[0], divided[1], divided[3], divided[4], divided[5], divided[6],
            new Ipv4Address([divided[7], divided[8], divided[9], divided[10]]),
            new Ipv4Address([divided[11], divided[12], divided[13], divided[14]]),
            new Ipv4Address([divided[15], divided[16], divided[17], divided[18]]),
            new Ipv4Address([divided[19], divided[20], divided[21], divided[22]]),
            new MacAddress([divided[23], divided[24], divided[25], divided[26], divided[27], divided[28]]),
            options
        );
    }
}