import { concat, divide, Ipv4Address, Ipv4Prefix, MacAddress, spread } from "../addressing.js";
import { EtherType, Frame } from "../frame.js";
import { Socket } from "../socket.js";
import { HTYPE } from "./arp.js";
import { IcmpControlMessage, IcmpDatagram } from "./icmp.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./ip.js";
import { UdpDatagram } from "./udp.js";
var DhcpOptions;
(function (DhcpOptions) {
    DhcpOptions[DhcpOptions["SUBNET_MASK"] = 1] = "SUBNET_MASK";
    DhcpOptions[DhcpOptions["TIME_OFFSET"] = 2] = "TIME_OFFSET";
    DhcpOptions[DhcpOptions["ROUTER"] = 3] = "ROUTER";
    DhcpOptions[DhcpOptions["TIME_SERVER"] = 4] = "TIME_SERVER";
    DhcpOptions[DhcpOptions["NAME_SERVER"] = 5] = "NAME_SERVER";
    DhcpOptions[DhcpOptions["DOMAIN_NAME_SERVER"] = 6] = "DOMAIN_NAME_SERVER";
    DhcpOptions[DhcpOptions["LEASE_TIME"] = 51] = "LEASE_TIME";
    DhcpOptions[DhcpOptions["MESSAGE_TYPE"] = 53] = "MESSAGE_TYPE";
    DhcpOptions[DhcpOptions["PARAMETER_REQUEST_LIST"] = 55] = "PARAMETER_REQUEST_LIST";
})(DhcpOptions || (DhcpOptions = {}));
;
var DhcpMessageType;
(function (DhcpMessageType) {
    DhcpMessageType[DhcpMessageType["DHCPDISCOVER"] = 1] = "DHCPDISCOVER";
    DhcpMessageType[DhcpMessageType["DHCPOFFER"] = 2] = "DHCPOFFER";
    DhcpMessageType[DhcpMessageType["DHCPREQUEST"] = 3] = "DHCPREQUEST";
    DhcpMessageType[DhcpMessageType["DHCPDECLINE"] = 4] = "DHCPDECLINE";
    DhcpMessageType[DhcpMessageType["DHCPACK"] = 5] = "DHCPACK";
    DhcpMessageType[DhcpMessageType["DHCPNACK"] = 6] = "DHCPNACK";
    DhcpMessageType[DhcpMessageType["DHCPRELEASE"] = 7] = "DHCPRELEASE";
    DhcpMessageType[DhcpMessageType["DHCPINFORM"] = 8] = "DHCPINFORM";
})(DhcpMessageType || (DhcpMessageType = {}));
export class DhcpServer {
    constructor(lib) {
        this._enabled = false;
        this._network = null;
        this._prefix = null;
        this._router = null;
        this.offers_given_mac = new Map();
        // MAC     IPv4
        this.offers_given_ipv4 = new Set();
        this.LEASE_TIME = 86400; // currently not enforced
        this.OFFER_TIMEOUT = 30000;
        this.lib = lib;
        this.sock = Socket.udpSocket(Ipv4Address.broadcast, DhcpServer.PORT);
    }
    get enabled() {
        return this._enabled;
    }
    set network(network) {
        this._network = network;
    }
    set prefix(prefix) {
        this._prefix = prefix;
        if (this._network) {
            this._network = this._network.and(this._prefix);
        }
    }
    set router(default_router) {
        this._router = default_router;
    }
    enable() {
        this._enabled = true;
        this.lib.bindUDP(this.sock);
        setTimeout(() => {
            this.listen();
        }, 0);
    }
    disable() {
        this._enabled = false;
        this.offers_given_mac.clear();
        this.offers_given_ipv4.clear();
        this.sock.kill();
        this.lib.closeUDP(this.sock);
    }
    async listen() {
        while (this._enabled) {
            const req = await this.sock.receive(5000);
            if (req && req[0].data) {
                const request = DhcpPayload.parse(req[0].data);
                if (request.op == OP.BOOTREQUEST && request.options.has(DhcpOptions.MESSAGE_TYPE)) {
                    const message_type = request.options.get(DhcpOptions.MESSAGE_TYPE)[1][0];
                    if (message_type == DhcpMessageType.DHCPDISCOVER) {
                        setTimeout(() => {
                            this.dhcpOffer(request);
                        }, 0);
                    }
                    else if (message_type == DhcpMessageType.DHCPREQUEST) {
                        setTimeout(() => {
                            this.dhcpAcknowledge(request);
                        }, 0);
                    }
                }
            }
        }
    }
    async dhcpOffer(request) {
        const chaddr_arr = request.chaddr.slice(0, 6);
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
        const offer_frame = this.createFrame(offer, chaddr, server_mac, server_ip, new Ipv4Address([0, 0, 0, 0]));
        console.log(`DHCP-SVR: SENDING OFFER`);
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
    dhcpAcknowledge(dhcp_payload) {
        const chaddr_arr = dhcp_payload.chaddr.slice(0, 6);
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
            const ack_frame = this.createFrame(ack, chaddr, server_mac, server_ip, new Ipv4Address([0, 0, 0, 0]));
            console.log(`DHCP-SVR: SENDING ACK`);
            this.lib.sendFrame(ack_frame, server_mac);
            this.offers_given_mac.delete(chaddr_str);
        }
    }
    findServerIpv4AndMac() {
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
    async findAvailableIpAddress(server_ip) {
        let try_ip = this._network.inc();
        for (; try_ip.compare(this._network.broadcastAddress(this._prefix)) != 0; try_ip = try_ip.inc()) {
            if (this.offers_given_ipv4.has(try_ip)) {
                continue;
            }
            const ping = IcmpDatagram.echoRequest(1, 1);
            const ping_pkt = new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.ICMP, server_ip, try_ip, [], ping.datagram);
            const sock = Socket.icmpSocketFrom(ping, ping_pkt);
            this.lib.bindICMP(sock);
            let resp0, resp1 = undefined;
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
    createFrame(dhcp_payload, client_mac, server_mac, server_ip, client_ip) {
        const discoverDatagram = new UdpDatagram(server_ip, client_ip, DhcpServer.PORT, DhcpClient.PORT, dhcp_payload.payload);
        const discoverPacket = new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.UDP, server_ip, client_ip, [], discoverDatagram.datagram);
        return new Frame(client_mac, server_mac, EtherType.IPv4, discoverPacket.packet);
    }
}
DhcpServer.PORT = 67;
export class DhcpClient {
    constructor(lib, setIpAndPrefix, setDefaultGateway) {
        this._enabled = false;
        this.active_sockets = new Map();
        this.killed = new Set();
        this.POLL_LEN = 5000;
        this.lib = lib;
        this.setIpAndPrefix = setIpAndPrefix;
        this.setDefaultGateway = setDefaultGateway;
    }
    get enabled() {
        return this._enabled;
    }
    disable(egress_mac) {
        this._enabled = false;
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
    async enable(egress_mac) {
        this._enabled = true;
        let found = false;
        const mac_str = egress_mac.toString();
        // TODO: should link-local address be used?
        this.setIpAndPrefix(egress_mac, new Ipv4Address([0, 0, 0, 0]), new Ipv4Prefix(0));
        // all sockets for a single device are identical -->
        // this will cause issues if DHCP is enabled simultaneously on multiple interfaces
        const sock = Socket.udpSocket(Ipv4Address.broadcast, DhcpClient.PORT);
        this.active_sockets.set(mac_str, sock);
        this.lib.bindUDP(sock);
        while (!found && !this.killed.has(egress_mac)) {
            const xid = Math.trunc(Math.random() * (2 ** 32));
            const discoverPayload = DhcpPayload.dhcpDiscover(xid, egress_mac);
            const discoverFrame = this.createFrame(discoverPayload, egress_mac);
            console.log(`DHCP-CLT: SENDING DISCOVER`);
            this.lib.sendFrame(discoverFrame, egress_mac);
            const resp = await sock.receive(this.POLL_LEN);
            if (resp && resp[0].data) {
                const offer_payload = DhcpPayload.parse(resp[0].data);
                if (offer_payload.op != OP.BOOTREPLY || offer_payload.xid != xid) {
                    continue;
                }
                found = true;
                let acknowledged = false;
                const requestPayload = DhcpPayload.dhcpRequest(xid, egress_mac, offer_payload.siaddr);
                const requestFrame = this.createFrame(requestPayload, egress_mac);
                while (!acknowledged && !this.killed.has(egress_mac)) {
                    console.log(`DHCP-CLT: SENDING REQUEST`);
                    this.lib.sendFrame(requestFrame, egress_mac);
                    const ack = await sock.receive(this.POLL_LEN);
                    if (ack && ack[0].data) {
                        const ack_payload = DhcpPayload.parse(ack[0].data);
                        if (ack_payload.op == OP.BOOTREPLY &&
                            ack_payload.xid == xid &&
                            ack_payload.options.has(DhcpOptions.MESSAGE_TYPE) &&
                            ack_payload.options.get(DhcpOptions.MESSAGE_TYPE)[1][0] == DhcpMessageType.DHCPACK &&
                            ack_payload.options.has(DhcpOptions.SUBNET_MASK) &&
                            ack_payload.options.get(DhcpOptions.SUBNET_MASK)[0] == 4) {
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
                                const router = ack_payload.options.get(DhcpOptions.ROUTER)[1];
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
    createFrame(dhcp_payload, client_mac) {
        const empty_ip = new Ipv4Address([0, 0, 0, 0]);
        const discoverDatagram = new UdpDatagram(empty_ip, Ipv4Address.broadcast, DhcpClient.PORT, DhcpServer.PORT, dhcp_payload.payload);
        const discoverPacket = new Ipv4Packet(0, 0, 64, InternetProtocolNumbers.UDP, empty_ip, Ipv4Address.broadcast, [], discoverDatagram.datagram);
        return new Frame(MacAddress.broadcast, client_mac, EtherType.IPv4, discoverPacket.packet);
    }
}
DhcpClient.PORT = 68;
var OP;
(function (OP) {
    OP[OP["BOOTREQUEST"] = 1] = "BOOTREQUEST";
    OP[OP["BOOTREPLY"] = 2] = "BOOTREPLY";
})(OP || (OP = {}));
;
class DhcpPayload {
    // can make public if needed
    constructor(op, htype, hops, xid, secs, flags, ciaddr, yiaddr, siaddr, giaddr, chaddr, options = new Map(), sname = new Uint8Array(64), file = new Uint8Array(128)) {
        this.hlen = MacAddress.byteLength;
        this.chaddr = new Uint8Array(16);
        this.sname = new Uint8Array(64);
        this.file = new Uint8Array(128);
        this.magic_cookie = new Uint8Array([99, 130, 83, 99]);
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
        for (let i = 0; i < 6; i++) {
            this.chaddr[i] = chaddr.value[i];
        }
        this.options = options;
        sname.slice(0, 64).forEach((i, octet) => this.sname[i] = octet);
        file.slice(0, 128).forEach((i, octet) => this.file[i] = octet);
        let options_bytes = [];
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
        this.payload = concat(new Uint8Array(spread([this.op, DhcpPayload._lengths[0]], [this.htype, DhcpPayload._lengths[1]], [this.hlen, DhcpPayload._lengths[2]], [this.hops, DhcpPayload._lengths[3]], [this.xid, DhcpPayload._lengths[4]], [this.secs, DhcpPayload._lengths[5]], [this.flags, DhcpPayload._lengths[6]])), this.ciaddr.value, this.yiaddr.value, this.siaddr.value, this.giaddr.value, this.chaddr, this.sname, this.file, this.magic_cookie, new Uint8Array(options_bytes));
    }
    static dhcpDiscover(xid, client_mac) {
        const empty_ip = new Ipv4Address([0, 0, 0, 0]);
        let options = new Map();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPDISCOVER])]);
        options.set(DhcpOptions.PARAMETER_REQUEST_LIST, [2, new Uint8Array([DhcpOptions.SUBNET_MASK, DhcpOptions.ROUTER])]);
        return new DhcpPayload(OP.BOOTREQUEST, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000, empty_ip, empty_ip, empty_ip, empty_ip, client_mac, options);
    }
    static dhcpRequest(xid, client_mac, server_ipv4) {
        const empty_ip = new Ipv4Address([0, 0, 0, 0]);
        let options = new Map();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPREQUEST])]);
        options.set(DhcpOptions.PARAMETER_REQUEST_LIST, [2, new Uint8Array([DhcpOptions.SUBNET_MASK, DhcpOptions.ROUTER])]);
        return new DhcpPayload(OP.BOOTREQUEST, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000, empty_ip, empty_ip, server_ipv4, empty_ip, client_mac, options);
    }
    static dhcpOffer(xid, client_mac, your_ipv4, server_ipv4, subnet_mask = null, router = null) {
        const empty_ip = new Ipv4Address([0, 0, 0, 0]);
        let options = new Map();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPOFFER])]);
        if (subnet_mask) {
            options.set(DhcpOptions.SUBNET_MASK, [4, subnet_mask.value]);
        }
        if (router) {
            options.set(DhcpOptions.ROUTER, [4, router.value]);
        }
        return new DhcpPayload(OP.BOOTREPLY, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000, empty_ip, your_ipv4, server_ipv4, empty_ip, client_mac, options);
    }
    static dhcpAck(xid, lease_time, client_mac, your_ipv4, server_ipv4, subnet_mask = null, router = null) {
        const empty_ip = new Ipv4Address([0, 0, 0, 0]);
        let options = new Map();
        options.set(DhcpOptions.MESSAGE_TYPE, [1, new Uint8Array([DhcpMessageType.DHCPACK])]);
        options.set(DhcpOptions.LEASE_TIME, [4, new Uint8Array(spread([lease_time, 32]))]);
        if (subnet_mask) {
            options.set(DhcpOptions.SUBNET_MASK, [4, subnet_mask.value]);
        }
        if (router) {
            options.set(DhcpOptions.ROUTER, [4, router.value]);
        }
        return new DhcpPayload(OP.BOOTREPLY, HTYPE.ETHERNET, 0x00, xid, 0x0000, 0x0000, empty_ip, your_ipv4, server_ipv4, empty_ip, client_mac, options);
    }
    static parse(payload) {
        const divided = divide(payload.slice(0, DhcpPayload._bytes_before_sname), DhcpPayload._lengths);
        const options_bytes = payload.slice(DhcpPayload._bytes_before_data);
        let options = new Map();
        for (let i = 0; i < options_bytes.length;) {
            const type = options_bytes[i];
            if (type == 0x00) {
                continue;
            }
            if (type == 0xff) {
                break;
            }
            const len = options_bytes[i + 1];
            let value = new Uint8Array(len);
            for (let j = 0; j < len; j++) {
                value[j] = options_bytes[i + 2 + j];
            }
            options.set(type, [len, value]);
            i += 2 + len;
        }
        return new DhcpPayload(divided[0], divided[1], divided[3], divided[4], divided[5], divided[6], new Ipv4Address([divided[7], divided[8], divided[9], divided[10]]), new Ipv4Address([divided[11], divided[12], divided[13], divided[14]]), new Ipv4Address([divided[15], divided[16], divided[17], divided[18]]), new Ipv4Address([divided[19], divided[20], divided[21], divided[22]]), new MacAddress([divided[23], divided[24], divided[25], divided[26], divided[27], divided[28]]), options);
    }
}
//  type     length  value
DhcpPayload._lengths = [
    8, 8, 8, 8, 32, 16, 16,
    8, 8, 8, 8, // ciaddr
    8, 8, 8, 8, // yiaddr
    8, 8, 8, 8, // siaddr
    8, 8, 8, 8, // giaddr
    8, 8, 8, 8, 8, 8, 80, // chaddr
];
DhcpPayload._bytes_before_sname = 44;
DhcpPayload._bytes_before_data = 240; // TODO: verify this constant
//# sourceMappingURL=dhcp.js.map