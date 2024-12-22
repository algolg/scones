"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ArpTable = exports.ArpPacket = exports.OP = void 0;
const addressing_1 = require("./addressing");
const frame_1 = require("./frame");
var HTYPE;
(function (HTYPE) {
    HTYPE[HTYPE["ETHERNET"] = 1] = "ETHERNET";
})(HTYPE || (HTYPE = {}));
// enum PTYPE { IPv4 = 0x0800 }
var OP;
(function (OP) {
    OP[OP["REQUEST"] = 1] = "REQUEST";
    OP[OP["REPLY"] = 2] = "REPLY";
})(OP || (exports.OP = OP = {}));
;
class ArpPacket {
    constructor(op, src_ha, src_pa, dest_ha = addressing_1.MacAddress.broadcast, dest_pa) {
        this._hlen = addressing_1.MacAddress.byteLength;
        this._plen = addressing_1.Ipv4Address.byteLength;
        this._htype = HTYPE.ETHERNET;
        this._ptype = frame_1.EtherType.IPv4;
        this._op = op;
        this._src_ha = src_ha;
        this._src_pa = src_pa;
        this._dest_ha = dest_ha;
        this._dest_pa = dest_pa;
        this._packet = new Uint8Array([
            ...(0, addressing_1.spread)([this._htype, ArpPacket._lengths[0]], [this._ptype, ArpPacket._lengths[1]], [this._hlen, ArpPacket._lengths[2]], [this._plen, ArpPacket._lengths[3]], [this._op, ArpPacket._lengths[4]]),
            ...this._src_ha.toArray(), ...this._src_pa.toArray(),
            ...this._dest_ha.toArray(), ...this._dest_pa.toArray()
        ]);
    }
    get ptype() {
        return this.ptype;
    }
    get op() {
        return this._op;
    }
    get src_ha() {
        return this.src_ha;
    }
    get src_pa() {
        return this.src_pa;
    }
    get dest_ha() {
        return this.dest_ha;
    }
    get dest_pa() {
        return this.dest_pa;
    }
    get packet() {
        return this._packet;
    }
    static parsePacket(packet) {
        const divided = (0, addressing_1.divide)(packet, this._lengths);
        const op = divided[4];
        const sh_arr = (0, addressing_1.spread)([divided[5], 48]);
        const sp_arr = (0, addressing_1.spread)([divided[6], 32]);
        const dh_arr = (0, addressing_1.spread)([divided[7], 48]);
        const dp_arr = (0, addressing_1.spread)([divided[8], 32]);
        const src_ha = new addressing_1.MacAddress([sh_arr[0], sh_arr[1], sh_arr[2], sh_arr[3], sh_arr[4], sh_arr[5]]);
        const src_pa = new addressing_1.Ipv4Address([sp_arr[0], sp_arr[1], sp_arr[2], sp_arr[3]]);
        const dest_ha = new addressing_1.MacAddress([dh_arr[0], dh_arr[1], dh_arr[2], dh_arr[3], dh_arr[4], dh_arr[5]]);
        const dest_pa = new addressing_1.Ipv4Address([dp_arr[0], dp_arr[1], dp_arr[2], dp_arr[3]]);
        return new ArpPacket(op, src_ha, src_pa, dest_ha, dest_pa);
    }
    printPacket() {
        console.log(this._packet.toHex());
    }
    /**
     * Creates a reply ARP packet from the current packet
     * @param new_src_ha the replying device's MAC address (i.e. the MAC address which the requesting device seeks)
     * @returns the reply ARP packet
     */
    makeReply(new_src_ha) {
        return new ArpPacket(OP.REPLY, new_src_ha, this.dest_pa, this.src_ha, this.src_pa);
    }
}
exports.ArpPacket = ArpPacket;
ArpPacket._lengths = [16, 16, 8, 8, 16, 48, 32, 48, 32];
class ArpTable {
    constructor() {
        this._table = new Map();
    }
    set(ip, remote_mac, local_mac) {
        this._table.set([ip.etherType, ip], [remote_mac, local_mac]);
    }
    delete(ip) {
        return this._table.delete([ip.etherType, ip]);
    }
    get(ip) {
        return this._table.get([ip.etherType, ip]);
    }
    has(ip) {
        return this._table.has([ip.etherType, ip]);
    }
}
exports.ArpTable = ArpTable;
// const arppacket = new ArpPacket(OP.REPLY, MacAddress.rand(), new Ipv4Address([192,168,0,10]), MacAddress.rand(), new Ipv4Address([192,168,0,50]));
// console.log(arppacket.packet);
// const arppacket_packet = arppacket.packet;
// const arp_repacketed = ArpPacket.parsePacket(arppacket_packet).packet;
// console.log(arp_repacketed);
//# sourceMappingURL=arp.js.map