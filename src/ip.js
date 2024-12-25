"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ipv4Packet = exports.InternetProtocolNumbers = void 0;
const addressing_1 = require("./addressing");
// RFC 790
var InternetProtocolNumbers;
(function (InternetProtocolNumbers) {
    InternetProtocolNumbers[InternetProtocolNumbers["ICMP"] = 1] = "ICMP";
    InternetProtocolNumbers[InternetProtocolNumbers["TCP"] = 6] = "TCP";
    InternetProtocolNumbers[InternetProtocolNumbers["UDP"] = 17] = "UDP";
})(InternetProtocolNumbers || (exports.InternetProtocolNumbers = InternetProtocolNumbers = {}));
;
class Ipv4Packet {
    // RFC 791, 2474
    constructor(dscp, ecn, ttl, protocol, src, dest, options, data) {
        this._version = 4; // 0
        this._identification = 0; // 5
        this._flags = 0; // 6
        this._fragment_offset = 0; // 7
        this._header_checksum = new Uint8Array([0, 0]);
        this._dscp = (0, addressing_1.limit)(dscp, Ipv4Packet._lengths[2]);
        this._ecn = (0, addressing_1.limit)(ecn, Ipv4Packet._lengths[3]);
        this._ttl = (0, addressing_1.limit)(ttl, Ipv4Packet._lengths[8]);
        this._protocol = (0, addressing_1.limit)(protocol, Ipv4Packet._lengths[9]);
        this._src = src;
        this._dest = dest;
        this._options = new Uint8Array((0, addressing_1.padTo32BitWords)(options));
        this._data = data;
        this._ihl = 5 + Math.trunc(this._options.length / 4);
        this._total_length = (this._ihl * 8) + this._data.length;
        let header = this.header;
        this._header_checksum = new Uint8Array((0, addressing_1.spread)([Ipv4Packet.calculateChecksum(header), 16]));
        for (let i = 0; i < 2; i++) {
            header[i + Ipv4Packet._bytes_before_checksum] = this._header_checksum[i];
        }
        this._packet = (0, addressing_1.concat)(header, this._data);
    }
    get dscp() {
        return this._dscp;
    }
    get ecn() {
        return this._ecn;
    }
    get protocol() {
        return this._protocol;
    }
    get src() {
        return this._src;
    }
    get dest() {
        return this._dest;
    }
    get packet() {
        return this._packet;
    }
    get packet_length() {
        return this._packet.length;
    }
    get header() {
        return new Uint8Array([
            ...(0, addressing_1.spread)([this._version, Ipv4Packet._lengths[0]], [this._ihl, Ipv4Packet._lengths[1]], [this._dscp, Ipv4Packet._lengths[2]], [this._ecn, Ipv4Packet._lengths[3]], [this._total_length, Ipv4Packet._lengths[4]], [this._identification, Ipv4Packet._lengths[5]], [this._flags, Ipv4Packet._lengths[6]], [this._fragment_offset, Ipv4Packet._lengths[7]], [this._ttl, Ipv4Packet._lengths[8]], [this._protocol, Ipv4Packet._lengths[9]]),
            ...this._header_checksum,
            ...this._src.toArray(), ...this._dest.toArray()
        ]);
    }
    static onesComplement16Bits(num) {
        return (~num >>> 0) & 0xFFFF;
    }
    static calculateChecksum(header_without_checksum) {
        let words = (0, addressing_1.divide)(header_without_checksum, Array(10).fill(16));
        let sum = 0;
        for (let word of words) {
            sum += word;
        }
        while (Math.ceil(Math.log2(sum)) > 16) {
            sum = (sum >>> 16) + (sum & 0xFFFF);
        }
        return Ipv4Packet.onesComplement16Bits(sum);
    }
    static verifyChecksum(packet) {
        return this.calculateChecksum(packet.header) == 0;
    }
    static parsePacket(packet) {
        const divided = (0, addressing_1.divide)(packet, Ipv4Packet._lengths);
        const ihl = divided[1];
        const dscp = divided[2];
        const ecn = divided[3];
        const ttl = divided[8];
        const protocol = divided[9];
        const src = new addressing_1.Ipv4Address([divided[11], divided[12], divided[13], divided[14]]);
        const dest = new addressing_1.Ipv4Address([divided[15], divided[16], divided[17], divided[18]]);
        const options = divided.slice(Ipv4Packet._bytes_before_options, ihl * 4);
        const data = new Uint8Array(divided.slice(ihl * 4));
        return new Ipv4Packet(dscp, ecn, ttl, protocol, src, dest, options, data);
    }
    static copyAndDecrement(packet, ttl_decrement = 1) {
        return new Ipv4Packet(packet._dscp, packet._ecn, packet._ttl - ttl_decrement, packet._protocol, packet._src, packet._dest, packet._options.toArray(), packet._data);
    }
}
exports.Ipv4Packet = Ipv4Packet;
Ipv4Packet._lengths = [4, 4, 6, 2, 16, 16, 3, 13, 8, 8, 16, 8, 8, 8, 8, 8, 8, 8, 8];
Ipv4Packet._bytes_before_checksum = 10;
Ipv4Packet._bytes_before_options = 20;
//# sourceMappingURL=ip.js.map