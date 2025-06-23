import { concat, divide, Ipv4Address, limit, spread } from "../addressing.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./ip.js";

export class UdpDatagram {
    readonly src_port: number;
    readonly dest_port: number;
    readonly length: number;
    readonly checksum = new Uint8Array(2);
    readonly data: Uint8Array;
    private static readonly _lengths: number[] = [16, 16, 16, 16];
    private static readonly _bytes_before_checksum = 6;
    private static readonly _bytes_before_data = 8;
    readonly datagram: Uint8Array;

    public constructor(src_address: Ipv4Address, dest_address: Ipv4Address, src_port: number, dest_port: number, data: Uint8Array, checksum?: number) {
        this.src_port = limit(src_port, UdpDatagram._lengths[0]);
        this.dest_port = limit(dest_port, UdpDatagram._lengths[1]);
        this.data = data;
        this.length = UdpDatagram._bytes_before_data + this.data.length;

        let pseudo_header = UdpDatagram.pseudoHeader(this, src_address, dest_address);
        const checksum_num = checksum ?? Ipv4Packet.calculateChecksum(pseudo_header);
        this.checksum = new Uint8Array(spread([checksum_num, UdpDatagram._lengths[3]]));

        this.datagram = concat(this.header, this.data);
    }

    public get header(): Uint8Array {
        return concat(
            new Uint8Array(spread(
                [this.src_port, UdpDatagram._lengths[0]],
                [this.dest_port, UdpDatagram._lengths[1]],
                [this.length, UdpDatagram._lengths[2]]
            )),
            this.checksum
        );
    }

    public static pseudoHeader(datagram: UdpDatagram, src_address: Ipv4Address, dest_address: Ipv4Address): Uint8Array {
        return concat(
            src_address.value, dest_address.value,
            new Uint8Array([
                0, InternetProtocolNumbers.UDP,
            ]),
            new Uint8Array(spread(
                [UdpDatagram._bytes_before_data + datagram.data.length, 16],
                [datagram.src_port, 16],
                [datagram.dest_port, 16],
                [datagram.length, 16],
            )),
            datagram.checksum,
            datagram.data
        );
    }

    public static verifyChecksum(datagram: UdpDatagram, src_address: Ipv4Address, dest_address: Ipv4Address): boolean {
        let pseudo_header = UdpDatagram.pseudoHeader(datagram, src_address, dest_address);
        return Ipv4Packet.calculateChecksum(pseudo_header) == 0;
    }

    public static parse(datagram: Uint8Array, src_address: Ipv4Address, dest_address: Ipv4Address): UdpDatagram {
        const divided = divide(datagram.slice(0, UdpDatagram._bytes_before_data), UdpDatagram._lengths);
        return new UdpDatagram(
            src_address, dest_address, divided[0], divided[1], datagram.slice(UdpDatagram._bytes_before_data), divided[3]
        );
    }
}