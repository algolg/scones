import { concat, divide, limit, padTo32BitWords, spread } from "../addressing.js";
import { Ipv4Packet } from "./ip.js";

export enum IcmpControlMessage { ECHO_REPLY = 0, UNREACHABLE = 3, ECHO_REQUEST = 8, TIME_EXCEEDED = 11 }
export enum IcmpUnreachableCode { NET = 0, HOST }

export class IcmpDatagram {
    readonly type: IcmpControlMessage;
    readonly code: number;
    private readonly _checksum = new Uint8Array(2);
    readonly extra_space: Uint8Array;
    readonly data: Uint8Array;
    private static readonly _lengths: number[] = [8, 8, 16, 8, 8, 8, 8];
    private static readonly _bytes_before_data = 8;
    readonly datagram: Uint8Array;

    // RFC 792
    public constructor(type: IcmpControlMessage, code: number, extra_space: number[], data: number[] = [], checksum?: number) {
        this.type = limit(type, 8);
        this.code = limit(code, 8);
        this.extra_space = new Uint8Array(padTo32BitWords(extra_space, 4).slice(-4));

        const space_taken = IcmpDatagram._bytes_before_data + data.length;
        this.data = concat(new Uint8Array(data), IcmpDatagram.generateRandomBytes(64 - space_taken));

        let datagram = concat(
            new Uint8Array(spread(
                [this.type, IcmpDatagram._lengths[0]], [this.code, IcmpDatagram._lengths[1]], 
            )),
            this._checksum,
            this.extra_space,
            this.data
        )
        const checksum_num: number = checksum ?? Ipv4Packet.calculateChecksum(datagram);
        this._checksum = new Uint8Array(spread([checksum_num, 16]));
        datagram[2] = this._checksum[0];
        datagram[3] = this._checksum[1];

        this.datagram = datagram;
    }

    public matchesRequest(other: IcmpDatagram): boolean {
        return this.isEchoReply && other.isEchoRequest && other.extra_space.every((val, idx) => val == this.extra_space[idx]);
    }

    public get isEchoRequest(): boolean {
        return this.type == IcmpControlMessage.ECHO_REQUEST;
    }

    public get isEchoReply(): boolean {
        return this.type == IcmpControlMessage.ECHO_REPLY;
    }

    public static echoRequest(identifier: number, seq_num: number): IcmpDatagram {
        return new IcmpDatagram(
            IcmpControlMessage.ECHO_REQUEST, 0, [...spread([limit(identifier, 16), 16]), ...spread([limit(seq_num, 16), 16])]
        )
    }

    public static echoReply(echo_request: IcmpDatagram): IcmpDatagram {
        return new IcmpDatagram(
            IcmpControlMessage.ECHO_REPLY, 0, echo_request.extra_space.toArray(), echo_request.data.toArray()
        );
    }

    public static hostUnreachable(ipv4_packet: Ipv4Packet): IcmpDatagram {
        return new IcmpDatagram(
            IcmpControlMessage.UNREACHABLE, IcmpUnreachableCode.HOST, [], concat(ipv4_packet.header, ipv4_packet.data.slice(0,64)).toArray()
        );
    }

    public static netUnreachable(ipv4_packet: Ipv4Packet): IcmpDatagram {
        return new IcmpDatagram(
            IcmpControlMessage.UNREACHABLE, IcmpUnreachableCode.NET, [], concat(ipv4_packet.header, ipv4_packet.data.slice(0,64)).toArray()
        );
    }

    public static timeExceeded(ipv4_packet: Ipv4Packet): IcmpDatagram {
        return new IcmpDatagram(
            IcmpControlMessage.TIME_EXCEEDED, 0, [], concat(ipv4_packet.header, ipv4_packet.data.slice(0,64)).toArray()
        );
    }

    public static verifyChecksum(datagram: IcmpDatagram): boolean {
        return Ipv4Packet.calculateChecksum(datagram.datagram) == 0;
    }

    public static parse(datagram: Uint8Array): IcmpDatagram {
        const divided = divide(datagram, IcmpDatagram._lengths);
        return new IcmpDatagram(
            divided[0], divided[1], [divided[3], divided[4], divided[5], divided[6]], divided.slice(7), divided[2]
        );
    }

    private static generateRandomBytes(bytes: number): Uint8Array {
        let output = new Uint8Array(Math.max(0,bytes));
        for (let i = 0; i < bytes; i++) {
            output[i] = 16 + i;
        }
        return output;
    }
}