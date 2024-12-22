"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Ipv4Packet = void 0;
class Ipv4Packet {
    constructor(sourceIPv4, destinationIPv4) {
        this._header = new Uint8Array(20);
        this._header[0] = (4 << 4) + (5 /* + options.length/4 */);
        this._header[1] = 0; // temp
        // splitting total length into two bytes
        this._header[2] = (20 /* + options.length + data.length*/) >> 8;
        this._header[3] = (20 /* + options.length + data.length*/) & 0b11111111;
        // there's more
        sourceIPv4.value.forEach((ele, idx) => (this._header[12 + idx] = ele));
        destinationIPv4.value.forEach((ele, idx) => (this._header[16 + idx] = ele));
    }
    get src() {
        return this._src;
    }
    get dest() {
        return this._dest;
    }
    get packet() {
        return new Uint8Array([
            ...this._header.toArray(),
            ...this._data.toArray()
        ]);
    }
    get packet_length() {
        return (this._header[2] << 8) + this._header[3];
    }
}
exports.Ipv4Packet = Ipv4Packet;
//# sourceMappingURL=ip.js.map