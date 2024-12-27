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
        this.version = 4; // 0
        this.identification = 0; // 5
        this.flags = 0; // 6
        this.fragment_offset = 0; // 7
        this._header_checksum = new Uint8Array(2);
        this.dscp = (0, addressing_1.limit)(dscp, Ipv4Packet._lengths[2]);
        this.ecn = (0, addressing_1.limit)(ecn, Ipv4Packet._lengths[3]);
        this.ttl = (0, addressing_1.limit)(ttl, Ipv4Packet._lengths[8]);
        this.protocol = (0, addressing_1.limit)(protocol, Ipv4Packet._lengths[9]);
        this.src = src;
        this.dest = dest;
        this.options = new Uint8Array((0, addressing_1.padTo32BitWords)(options, 0, 40));
        this.data = data;
        this.ihl = 5 + Math.trunc(this.options.length / 4);
        this.total_length = (this.ihl * 8) + this.data.length;
        let header = this.header;
        this._header_checksum = new Uint8Array((0, addressing_1.spread)([Ipv4Packet.calculateChecksum(header), 16]));
        for (let i = 0; i < 2; i++) {
            header[i + Ipv4Packet._bytes_before_checksum] = this._header_checksum[i];
        }
        this.packet = (0, addressing_1.concat)(header, this.data);
    }
    get packet_length() {
        return this.packet.length;
    }
    get header() {
        return (0, addressing_1.concat)(new Uint8Array((0, addressing_1.spread)([this.version, Ipv4Packet._lengths[0]], [this.ihl, Ipv4Packet._lengths[1]], [this.dscp, Ipv4Packet._lengths[2]], [this.ecn, Ipv4Packet._lengths[3]], [this.total_length, Ipv4Packet._lengths[4]], [this.identification, Ipv4Packet._lengths[5]], [this.flags, Ipv4Packet._lengths[6]], [this.fragment_offset, Ipv4Packet._lengths[7]], [this.ttl, Ipv4Packet._lengths[8]], [this.protocol, Ipv4Packet._lengths[9]])), this._header_checksum, this.src.value, this.dest.value);
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
        const data = new Uint8Array(divided.slice(ihl * 4 - 1));
        return new Ipv4Packet(dscp, ecn, ttl, protocol, src, dest, options, data);
    }
    static copyAndDecrement(packet, ttl_decrement = 1) {
        return new Ipv4Packet(packet.dscp, packet.ecn, packet.ttl - ttl_decrement, packet.protocol, packet.src, packet.dest, packet.options.toArray(), packet.data);
    }
}
exports.Ipv4Packet = Ipv4Packet;
Ipv4Packet._lengths = [4, 4, 6, 2, 16, 16, 3, 13, 8, 8, 16, 8, 8, 8, 8, 8, 8, 8, 8];
Ipv4Packet._bytes_before_checksum = 10;
Ipv4Packet._bytes_before_options = 20;
//# sourceMappingURL=ip.js.map