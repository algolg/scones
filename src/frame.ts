import { concat, MacAddress, spread } from "./addressing.js";

export enum EtherType { IEEE802dot3_Upper = 0x05dc, IPv4 = 0x0800, ARP = 0x0806, IPv6 = 0x86DD };
enum IEEE802dot3_ProtocolIdentifier { STP = 0x0000 };
enum BPDUType { Configuration = 0x00 };

// export interface Frame {
    // idk, rename class Frame to EthernetII_Frame?
    // then make a new 802_3_Frame class?
    // either way, "Frame" is very general and are different depending on link type, so broadening the definition might be good
// }
// alternatively, stick with Frame -- however, per IANA, if EtherType <= 05DC, the frame is 802.3 (e.g. STP BPDUs),
// and the _packet field will contain the extra info to decode --> more rules needed for frame processing

export class Frame {
    private readonly _dest_mac: MacAddress;
    private readonly _src_mac: MacAddress;
    private readonly _ethertype: EtherType;
    private readonly _packet: Uint8Array;
    private readonly _fcs: Uint8Array;
    private readonly _frame: Uint8Array;

    public constructor(dest_mac: MacAddress, src_mac: MacAddress, ethertype: EtherType, packet: Uint8Array) {
        this._dest_mac = dest_mac;
        this._src_mac = src_mac;
        this._ethertype = ethertype;
        this._packet = packet;
        this._frame = new Uint8Array([
            ...this._dest_mac.toArray(), ...this._src_mac.toArray(),
            ...spread([this._ethertype, 16]),
            ...this._packet.toArray(),
            0, 0, 0, 0
        ])
        this._fcs = new Uint8Array(this.calculateFCS());
        for (let i=0; i < 4; i++) {
            this._frame[this._frame.length-4+i] = this._fcs[i];
        }
    }

    public get packet() {
        return this._packet;
    }

    public get dest_mac(): MacAddress {
        return this._dest_mac;
    }

    public get src_mac(): MacAddress {
        return this._src_mac;
    }

    public get ethertype(): Readonly<EtherType> {
        return this._ethertype
    }

    private calculateFCS(): number[] {
        let crc: number = 0xFFFFFFFF;
        let i: number;
        for (i = 0; i < this._frame.length-4; i++) {
            crc ^= this._frame[i];
            for (let k = 0; k < 8; k++) {
                crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
            }
        }
        crc ^= 0xFFFFFFFF;
        return spread([crc >>> 0, 32]);
    }

    public printFrame() {
        console.log(this._frame.toHex());
    }
}

export class IEEE802dot3_Frame {
    readonly length: number;
    readonly dsap: number;
    readonly ssap: number;
    readonly control: Uint8Array;
    readonly data: Uint8Array;
    readonly frame: Uint8Array;

    constructor(dsap: number, ssap: number, control: Uint8Array, data: Uint8Array) {
        this.dsap = dsap;
        this.ssap = ssap;
        this.control = control;
        this.data = data;
        this.length = data.length;
        this.frame = concat(new Uint8Array([dsap, ssap]), control, data);
    }

    parseData(frame_data: Uint8Array) {
        const dsap = frame_data[0];
        const ssap = frame_data[1];
        const control_len = this.dsap == 0xAA && this.dsap == 0xAA ? 1 : 2;
        const control = frame_data.slice(2, 2+control_len);
        const data = frame_data.slice(2 + control_len);
        return new IEEE802dot3_Frame(dsap, ssap, control, data);
    }

    public static newBPDU(): IEEE802dot3_Frame {
        const PID = spread([IEEE802dot3_ProtocolIdentifier.STP, 16])
        const data = new Uint8Array([
            PID[0], PID[1], BPDUType.Configuration, 0 /* Topology Change: No */,
            
        ]);
        return new IEEE802dot3_Frame(0x42, 0x42, new Uint8Array(0x03), data);
    }
}