import { Ipv4Address } from "./addressing";
import { Packet } from "./packet";

export class Ipv4Packet implements Packet {
    private _src: Ipv4Address;
    private _dest: Ipv4Address;
    private _header = new Uint8Array(20);
    private _data: Uint8Array;

    public constructor(sourceIPv4: Ipv4Address, destinationIPv4: Ipv4Address) {
        this._header[0] = (4 << 4) + (5 /* + options.length/4 */);
        this._header[1] = 0; // temp
        // splitting total length into two bytes
        this._header[2] = (20 /* + options.length + data.length*/) >> 8;
        this._header[3] = (20 /* + options.length + data.length*/) & 0b11111111;
        // there's more
        sourceIPv4.value.forEach((ele, idx) => (this._header[12+idx] = ele));
        destinationIPv4.value.forEach((ele, idx) => (this._header[16+idx] = ele));
    }

    public get src(): Ipv4Address {
        return this._src;
    }

    public get dest(): Ipv4Address {
        return this._dest;
    }

    public get packet(): Uint8Array {
        return new Uint8Array([
            ...this._header.toArray(),
            ...this._data.toArray()
        ]);
    }

    public get packet_length(): number {
        return (this._header[2] << 8) + this._header[3];
    }
}