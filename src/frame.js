"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Frame = exports.EtherType = void 0;
const addressing_1 = require("./addressing");
var EtherType;
(function (EtherType) {
    EtherType[EtherType["IPv4"] = 2048] = "IPv4";
    EtherType[EtherType["ARP"] = 2054] = "ARP";
    EtherType[EtherType["IPv6"] = 34525] = "IPv6";
})(EtherType || (exports.EtherType = EtherType = {}));
;
class Frame {
    constructor(dest_mac, src_mac, ethertype, packet) {
        this._dest_mac = dest_mac;
        this._src_mac = src_mac;
        this._ethertype = ethertype;
        this._packet = packet;
        this._frame = new Uint8Array([
            ...this._dest_mac.toArray(), ...this._src_mac.toArray(),
            ...(0, addressing_1.spread)([this._ethertype, 16]),
            ...this._packet.toArray(),
            0, 0, 0, 0
        ]);
        this._fcs = new Uint8Array(this.calculateFCS());
        for (let i = 0; i < 4; i++) {
            this._frame[this._frame.length - 4 + i] = this._fcs[i];
        }
    }
    get packet() {
        return this._packet;
    }
    get dest_mac() {
        return this._dest_mac;
    }
    get src_mac() {
        return this._src_mac;
    }
    get ethertype() {
        return this._ethertype;
    }
    calculateFCS() {
        let crc = 0xFFFFFFFF;
        let i;
        for (i = 0; i < this._frame.length - 4; i++) {
            crc ^= this._frame[i];
            for (let k = 0; k < 8; k++) {
                crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
            }
        }
        crc ^= 0xFFFFFFFF;
        return (0, addressing_1.spread)([crc >>> 0, 32]);
    }
    printFrame() {
        console.log(this._frame.toHex());
    }
}
exports.Frame = Frame;
//# sourceMappingURL=frame.js.map