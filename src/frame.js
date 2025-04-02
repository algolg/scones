import { concat, spread } from "./addressing.js";
export var EtherType;
(function (EtherType) {
    EtherType[EtherType["IEEE802dot3_Upper"] = 1500] = "IEEE802dot3_Upper";
    EtherType[EtherType["IPv4"] = 2048] = "IPv4";
    EtherType[EtherType["ARP"] = 2054] = "ARP";
    EtherType[EtherType["IPv6"] = 34525] = "IPv6";
})(EtherType || (EtherType = {}));
;
var IEEE802dot3_ProtocolIdentifier;
(function (IEEE802dot3_ProtocolIdentifier) {
    IEEE802dot3_ProtocolIdentifier[IEEE802dot3_ProtocolIdentifier["STP"] = 0] = "STP";
})(IEEE802dot3_ProtocolIdentifier || (IEEE802dot3_ProtocolIdentifier = {}));
;
var BPDUType;
(function (BPDUType) {
    BPDUType[BPDUType["Configuration"] = 0] = "Configuration";
})(BPDUType || (BPDUType = {}));
;
// export interface Frame {
// idk, rename class Frame to EthernetII_Frame?
// then make a new 802_3_Frame class?
// either way, "Frame" is very general and are different depending on link type, so broadening the definition might be good
// }
// alternatively, stick with Frame -- however, per IANA, if EtherType <= 05DC, the frame is 802.3 (e.g. STP BPDUs),
// and the _packet field will contain the extra info to decode --> more rules needed for frame processing
export class Frame {
    constructor(dest_mac, src_mac, ethertype, packet) {
        this._dest_mac = dest_mac;
        this._src_mac = src_mac;
        this._ethertype = ethertype;
        this._packet = packet;
        this._frame = new Uint8Array([
            ...this._dest_mac.toArray(), ...this._src_mac.toArray(),
            ...spread([this._ethertype, 16]),
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
        return spread([crc >>> 0, 32]);
    }
    printFrame() {
        console.log(this._frame.toHex());
    }
}
export class IEEE802dot3_Frame {
    constructor(dsap, ssap, control, data) {
        this.dsap = dsap;
        this.ssap = ssap;
        this.control = control;
        this.data = data;
        this.length = data.length;
        this.frame = concat(new Uint8Array([dsap, ssap]), control, data);
    }
    parseData(frame_data) {
        const dsap = frame_data[0];
        const ssap = frame_data[1];
        const control_len = this.dsap == 0xAA && this.dsap == 0xAA ? 1 : 2;
        const control = frame_data.slice(2, 2 + control_len);
        const data = frame_data.slice(2 + control_len);
        return new IEEE802dot3_Frame(dsap, ssap, control, data);
    }
    static newBPDU() {
        const PID = spread([IEEE802dot3_ProtocolIdentifier.STP, 16]);
        const data = new Uint8Array([
            PID[0], PID[1], BPDUType.Configuration, 0 /* Topology Change: No */,
        ]);
        return new IEEE802dot3_Frame(0x42, 0x42, new Uint8Array(0x03), data);
    }
}
//# sourceMappingURL=frame.js.map