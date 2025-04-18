import { Ipv4Address, concat, divide, limit, padTo32BitWords, spread } from "../addressing.js";
import { Packet } from "../packet.js";

// RFC 790
export enum InternetProtocolNumbers { ICMP = 1, TCP = 6, UDP = 17 };

export class Ipv4Packet implements Packet {
    readonly version: number = 4;                          // 0
    readonly ihl: number;                                  // 1
    readonly dscp: number;                                 // 2
    readonly ecn: number;                                  // 3
    readonly total_length: number;                         // 4
    readonly identification: number = 0;                   // 5
    readonly flags: number = 0;                            // 6
    readonly fragment_offset: number = 0;                  // 7
    readonly ttl: number;                                  // 8
    readonly protocol: InternetProtocolNumbers;            // 9
    private readonly _header_checksum = new Uint8Array(2); // 10
    readonly src: Ipv4Address;
    readonly dest: Ipv4Address;
    readonly options: Uint8Array;
    readonly data: Uint8Array;
    readonly packet: Uint8Array;
    private static readonly _lengths: number[] = [4, 4, 6, 2, 16, 16, 3, 13, 8, 8, 16, 8, 8, 8, 8, 8, 8, 8, 8];
    private static readonly _bytes_before_checksum = 10;
    private static readonly _bytes_before_options = 20;

    // RFC 791, 2474
    public constructor(dscp: number, ecn: number, ttl: number, protocol: InternetProtocolNumbers, src: Ipv4Address, dest: Ipv4Address, options: number[], data: Uint8Array, checksum?: number) {
        this.dscp = limit(dscp, Ipv4Packet._lengths[2]);
        this.ecn = limit(ecn, Ipv4Packet._lengths[3]);
        this.ttl = limit(ttl, Ipv4Packet._lengths[8]);
        this.protocol = limit(protocol, Ipv4Packet._lengths[9]);
        this.src = src;
        this.dest = dest;
        this.options = new Uint8Array(padTo32BitWords(options, 0, 40));
        this.data = data;
        this.ihl = 5 + Math.trunc(this.options.length / 4);
        this.total_length = (this.ihl * 8) + this.data.length;

        let header = this.header;
        const checksum_num = checksum ?? Ipv4Packet.calculateChecksum(header)
        this._header_checksum = new Uint8Array(spread([checksum_num, 16]));
        for (let i = 0; i < 2; i++) {
            header[i + Ipv4Packet._bytes_before_checksum] = this._header_checksum[i];
        }
        this.packet = concat(header, this.data);
    }

    public get packet_length(): number {
        return this.packet.length;
    }

    public get header(): Uint8Array {
        return concat(
            new Uint8Array(spread(
                [this.version, Ipv4Packet._lengths[0]], [this.ihl, Ipv4Packet._lengths[1]],
                [this.dscp, Ipv4Packet._lengths[2]], [this.ecn, Ipv4Packet._lengths[3]],
                [this.total_length, Ipv4Packet._lengths[4]], 
                [this.identification, Ipv4Packet._lengths[5]],
                [this.flags, Ipv4Packet._lengths[6]], [this.fragment_offset, Ipv4Packet._lengths[7]],
                [this.ttl, Ipv4Packet._lengths[8]], [this.protocol, Ipv4Packet._lengths[9]],
            )),
            this._header_checksum,
            this.src.value, this.dest.value
        )
    }

    private static onesComplement16Bits(num: number): number {
        return (~num >>> 0) & 0xFFFF;
    }

    public static calculateChecksum(header_without_checksum: Uint8Array): number {
        let words = divide(header_without_checksum, Array<number>(header_without_checksum.length / 2).fill(16));
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
        const header_checksum: number = divided[10];
        const src: Ipv4Address = new Ipv4Address([divided[11], divided[12], divided[13], divided[14]]);
        const dest: Ipv4Address = new Ipv4Address([divided[15], divided[16], divided[17], divided[18]]);
        const options: number[] = divided.slice(Ipv4Packet._bytes_before_options, ihl * 4);
        const data: Uint8Array = new Uint8Array(divided.slice(ihl * 4 - 1));
        return new Ipv4Packet(dscp, ecn, ttl, protocol, src, dest, options, data, header_checksum);
    }

    public static copyAndDecrement(packet: Ipv4Packet, ttl_decrement: number = 1): Ipv4Packet {
        return new Ipv4Packet(
            packet.dscp, packet.ecn, packet.ttl - ttl_decrement, packet.protocol,
            packet.src, packet.dest, packet.options.toArray(), packet.data
        );
    }
}