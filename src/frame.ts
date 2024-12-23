import { MacAddress, spread } from "./addressing";

export enum EtherType { IPv4 = 0x0800, ARP = 0x0806, IPv6 = 0x86DD };

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