import { Ipv4Address, concat, divide, limit, padTo32BitWords, spread } from "./addressing";
import { Packet } from "./packet";

// RFC 790
export enum InternetProtocolNumbers { ICMP = 1, TCP = 6, UDP = 17 };

export class Ipv4Packet implements Packet {
    private readonly _version: number = 4;                // 0
    private readonly _ihl: number;                        // 1
    private readonly _dscp: number;                       // 2
    private readonly _ecn: number;                        // 3
    private readonly _total_length: number;               // 4
    private readonly _identification: number = 0;         // 5
    private readonly _flags: number = 0;                  // 6
    private readonly _fragment_offset: number = 0;        // 7
    private readonly _ttl: number;                        // 8
    private readonly _protocol: InternetProtocolNumbers;  // 9
    private readonly _header_checksum = new Uint8Array([0,0]);
    private readonly _src: Ipv4Address;
    private readonly _dest: Ipv4Address;
    private readonly _options: Uint8Array;
    private readonly _data: Uint8Array;
    private readonly _packet: Uint8Array;
    private static readonly _lengths: number[] = [4, 4, 6, 2, 16, 16, 3, 13, 8, 8, 16, 8, 8, 8, 8, 8, 8, 8, 8];
    private static readonly _bytes_before_checksum = 10;
    private static readonly _bytes_before_options = 20;

    // RFC 791, 2474
    public constructor(dscp: number, ecn: number, ttl: number, protocol: InternetProtocolNumbers, src: Ipv4Address, dest: Ipv4Address, options: number[], data: Uint8Array) {
        this._dscp = limit(dscp, Ipv4Packet._lengths[2]);
        this._ecn = limit(ecn, Ipv4Packet._lengths[3]);
        this._ttl = limit(ttl, Ipv4Packet._lengths[8]);
        this._protocol = limit(protocol, Ipv4Packet._lengths[9]);
        this._src = src;
        this._dest = dest;
        this._options = new Uint8Array(padTo32BitWords(options));
        this._data = data;
        this._ihl = 5 + Math.trunc(this._options.length / 4);
        this._total_length = (this._ihl * 8) + this._data.length;

        let header = this.header;
        this._header_checksum = new Uint8Array(spread([Ipv4Packet.calculateChecksum(header), 16]));
        for (let i = 0; i < 2; i++) {
            header[i + Ipv4Packet._bytes_before_checksum] = this._header_checksum[i];
        }
        this._packet = concat(header, this._data);
    }

    public get dscp(): number {
        return this._dscp;
    }

    public get ecn(): number {
        return this._ecn;
    }

    public get protocol(): InternetProtocolNumbers {
        return this._protocol;
    }

    public get src(): Ipv4Address {
        return this._src;
    }

    public get dest(): Ipv4Address {
        return this._dest;
    }

    public get packet(): Uint8Array {
        return this._packet;
    }

    public get packet_length(): number {
        return this._packet.length;
    }

    private get header(): Uint8Array {
        return new Uint8Array([
            ...spread(
                [this._version, Ipv4Packet._lengths[0]], [this._ihl, Ipv4Packet._lengths[1]],
                [this._dscp, Ipv4Packet._lengths[2]], [this._ecn, Ipv4Packet._lengths[3]],
                [this._total_length, Ipv4Packet._lengths[4]], 
                [this._identification, Ipv4Packet._lengths[5]],
                [this._flags, Ipv4Packet._lengths[6]], [this._fragment_offset, Ipv4Packet._lengths[7]],
                [this._ttl, Ipv4Packet._lengths[8]], [this._protocol, Ipv4Packet._lengths[9]],
            ),
            ...this._header_checksum,
            ...this._src.toArray(), ...this._dest.toArray()
        ])
    }

    private static onesComplement16Bits(num: number): number {
        return (~num >>> 0) & 0xFFFF;
    }

    private static calculateChecksum(header_without_checksum: Uint8Array): number {
        let words = divide(header_without_checksum, Array<number>(10).fill(16));
        let sum = 0;
        for (let word of words) {
            sum += word;
        }
        while (Math.ceil(Math.log2(sum)) > 16) {
            sum = (sum >>> 16) + (sum & 0xFFFF);
        }
        return Ipv4Packet.onesComplement16Bits(sum);
    }

    public static verifyChecksum(packet: Ipv4Packet): boolean {
        return this.calculateChecksum(packet.header) == 0;
    }

    public static parsePacket(packet: Uint8Array): Ipv4Packet {
        const divided: number[] = divide(packet, Ipv4Packet._lengths);
        const ihl: number = divided[1];
        const dscp: number = divided[2];
        const ecn: number = divided[3];
        const ttl: number = divided[8];
        const protocol: InternetProtocolNumbers = divided[9];
        const src: Ipv4Address = new Ipv4Address([divided[11], divided[12], divided[13], divided[14]]);
        const dest: Ipv4Address = new Ipv4Address([divided[15], divided[16], divided[17], divided[18]]);
        const options: number[] = divided.slice(Ipv4Packet._bytes_before_options, ihl * 4);
        const data: Uint8Array = new Uint8Array(divided.slice(ihl * 4));
        return new Ipv4Packet(dscp, ecn, ttl, protocol, src, dest, options, data);
    }

    public static copyAndDecrement(packet: Ipv4Packet, ttl_decrement: number = 1): Ipv4Packet {
        return new Ipv4Packet(
            packet._dscp, packet._ecn, packet._ttl - ttl_decrement, packet._protocol,
            packet._src, packet._dest, packet._options.toArray(), packet._data
        );
    }
}