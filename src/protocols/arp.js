import { Ipv4Address, MacAddress, concat, divide, spread } from "../addressing.js";
import { EtherType } from "../frame.js";
export var HTYPE;
(function (HTYPE) {
    HTYPE[HTYPE["ETHERNET"] = 1] = "ETHERNET";
})(HTYPE || (HTYPE = {}));
// enum PTYPE { IPv4 = 0x0800 }
export var OP;
(function (OP) {
    OP[OP["REQUEST"] = 1] = "REQUEST";
    OP[OP["REPLY"] = 2] = "REPLY";
})(OP || (OP = {}));
;
export class ArpPacket {
    constructor(op, src_ha, src_pa, dest_ha = MacAddress.broadcast, dest_pa) {
        this._hlen = MacAddress.byteLength;
        this._plen = Ipv4Address.byteLength;
        this._htype = HTYPE.ETHERNET;
        this._ptype = EtherType.IPv4;
        this._op = op;
        this._src_ha = src_ha;
        this._src_pa = src_pa;
        this._dest_ha = dest_ha;
        this._dest_pa = dest_pa;
        this._packet = concat(new Uint8Array(spread([this._htype, ArpPacket._lengths[0]], [this._ptype, ArpPacket._lengths[1]], [this._hlen, ArpPacket._lengths[2]], [this._plen, ArpPacket._lengths[3]], [this._op, ArpPacket._lengths[4]])), this._src_ha.value, this._src_pa.value, this._dest_ha.value, this._dest_pa.value);
    }
    get ptype() {
        return this.ptype;
    }
    get op() {
        return this._op;
    }
    get src_ha() {
        return this._src_ha;
    }
    get src_pa() {
        return this._src_pa;
    }
    get dest_ha() {
        return this._dest_ha;
    }
    get dest_pa() {
        return this._dest_pa;
    }
    get packet() {
        return this._packet;
    }
    static parsePacket(packet) {
        const divided = divide(packet, this._lengths);
        const op = divided[4];
        const sh_arr = spread([divided[5], 48]);
        const sp_arr = spread([divided[6], 32]);
        const dh_arr = spread([divided[7], 48]);
        const dp_arr = spread([divided[8], 32]);
        const src_ha = new MacAddress([sh_arr[0], sh_arr[1], sh_arr[2], sh_arr[3], sh_arr[4], sh_arr[5]]);
        const src_pa = new Ipv4Address([sp_arr[0], sp_arr[1], sp_arr[2], sp_arr[3]]);
        const dest_ha = new MacAddress([dh_arr[0], dh_arr[1], dh_arr[2], dh_arr[3], dh_arr[4], dh_arr[5]]);
        const dest_pa = new Ipv4Address([dp_arr[0], dp_arr[1], dp_arr[2], dp_arr[3]]);
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
ArpPacket._lengths = [16, 16, 8, 8, 16, 48, 32, 48, 32];
export class ArpTable {
    constructor() {
        this._local_infs = [];
        this._table = new Map();
    }
    keyToString(ethertype, ip) {
        return `${ethertype}${ip}`;
    }
    setLocalInfs(...l3infs) {
        l3infs.forEach((l3inf) => this._local_infs.push(l3inf.ipv4));
    }
    set(ip, remote_mac, local_mac) {
        console.log(`!! ${local_mac}: adding ${ip} (${remote_mac}) to my ARP table`);
        this._table.set(this.keyToString(ip.ethertype, ip), [remote_mac, local_mac]);
    }
    delete(ip) {
        return this._table.delete(this.keyToString(ip.ethertype, ip));
    }
    /**
     * Returns an ARP table entry for a given IP address
     * @param ip the IP address to get the ARP entry of
     * @returns (remote MAC, local MAC) pair, if one exists. null otherwise
     */
    get(ip) {
        if (this._local_infs.some((inf) => inf !== undefined && inf.compare(ip) == 0)) {
            return [MacAddress.loopback, MacAddress.loopback];
        }
        return this._table.get(this.keyToString(ip.ethertype, ip)) ?? null;
    }
    has(ip) {
        return this._table.has(this.keyToString(ip.ethertype, ip));
    }
    clearValue(egress) {
        let toClear = [];
        for (let [key, value] of this._table.entries()) {
            if (value[1].compare(egress) == 0) {
                toClear.push(key);
            }
        }
        for (let destination of toClear) {
            this._table.delete(destination);
        }
        return toClear.length;
    }
}
//# sourceMappingURL=arp.js.map