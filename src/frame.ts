import { MacAddress, spread } from "./addressing";

export enum EtherType { IPv4 = 0x0800, ARP = 0x0806, IPv6 = 0x86DD };

export class Frame {
    private _dest_mac: MacAddress;
    private _src_mac: MacAddress;
    private _ethertype: EtherType;
    private _packet: Uint8Array;
    private _fcs: Uint8Array;
    private _frame: Uint8Array;

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
        const fcs = this.calculateFCS();
        for (let i=0; i < 4; i++) {
            this._frame[this._frame.length-4+i] = fcs[i];
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
        console.log((crc >>> 0).toString(16));
        return spread([crc >>> 0, 32]);
    }

    public printFrame() {
        console.log(this._frame.toHex());
    }
}

export class SentFrame {
    private _frame: Frame;
    private _ingress_mac: MacAddress;

    /**
     * Creates a SentFrame object
     * @param frame the Frame which is being sent
     * @param ingress_mac the MAC address of the receiving interface
     */
    public constructor(frame: Frame, ingress_mac: MacAddress) {
        this._frame = frame;
        this._ingress_mac = ingress_mac;
    }

    public get frame(): Frame {
        return this._frame;
    }

    public get ingress_mac(): MacAddress {
        return this._ingress_mac
    }
}