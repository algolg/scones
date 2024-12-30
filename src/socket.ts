import { IcmpDatagram } from "./icmp.js";
import { Ipv4Packet } from "./ip.js";

export enum Action { BLOCK, ACCEPT, SEND/*?*/ };
export enum Direction { EITHER, IN, OUT };
export enum Protocol { IPv4, ICMP, TCP, UDP };

export class Socket<T extends Ipv4Packet | IcmpDatagram /* and the others */> {
    readonly protocol: Protocol;
    private readonly _check: (protocol_data: T, packet: Ipv4Packet) => boolean;
    private readonly _createResponse: (packet: Ipv4Packet) => Ipv4Packet = (packet) => undefined;
        /**
         * This member is based on the idea that the socket (or the application that creates the
         * socket) is the one that generates a response packet. If I change my mind, then remove
         * this member and Action.SEND.
         */
        /**
         * If I choose to keep this member, also consider whether the input and output should be of
         * type Ipv4Packet or T
         */
    readonly action: Action; 
    readonly direction: Direction;
    private readonly _matched: Set<T> = new Set();
    private _hits: number = 0;

    public constructor(protocol: Protocol, direction: Direction, check_function: (arg0: T, arg1: Ipv4Packet) => boolean, action: Action = Action.ACCEPT) {
        this.protocol = protocol;
        this.direction = direction;
        this._check = check_function;
        this.action = action;
    }

    public get hits(): number {
        return this._hits;
    }

    public check(protocol_data: T, packet: Ipv4Packet): boolean {
        if (this._check(protocol_data, packet)) {
            this._matched.add(protocol_data);
            this._hits++;
            return true;
        }
        return false;
    }

    public get matched_top(): T {
        if (this._matched.size > 0) {
            const ele: T = this._matched.values().next().value;
            this._matched.delete(ele);
            return ele;
        }
        else {
            return undefined;
        }
    }

    public createResponse(packet: Ipv4Packet): Ipv4Packet {
        return this._createResponse(packet);
    }

    public static icmpSocketFrom(echo_request: IcmpDatagram, echo_packet: Ipv4Packet): Socket<IcmpDatagram> {
        return new Socket(
            Protocol.ICMP,
            Direction.IN,
            (icmp_datagram: IcmpDatagram, ipv4_packet: Ipv4Packet): boolean => {
                return (
                    icmp_datagram.matchesRequest(echo_request)
                    && echo_packet.src.compare(ipv4_packet.dest) == 0
                    && echo_packet.dest.compare(ipv4_packet.src) == 0
                ) || (
                    !icmp_datagram.isEchoReply && !icmp_datagram.isEchoRequest &&
                    icmp_datagram.data.slice(echo_packet.ihl * 4).every((x,idx) => x == echo_packet.data[idx])
                );
            },
        )
    }
    
}

export class SocketTable {
    private _ipv4_sockets: Set<Socket<Ipv4Packet>> = new Set();
    private _icmp_sockets: Set<Socket<IcmpDatagram>> = new Set();
    // and the others
    
    public addIpv4Socket(socket: Socket<Ipv4Packet>) {
        this._ipv4_sockets.add(socket);
    }
    
    public addIcmpSocket(socket: Socket<IcmpDatagram>) {
        this._icmp_sockets.add(socket);
    }

    public getIpv4Sockets(): Set<Socket<Ipv4Packet>> {
        return this._ipv4_sockets;
    }

    public getIcmpSockets(): Set<Socket<IcmpDatagram>> {
        return this._icmp_sockets;
    }

    public deleteIpv4Socket(socket: Socket<Ipv4Packet>) {
        this._ipv4_sockets.delete(socket);
    }

    public deleteIcmpSocket(socket: Socket<IcmpDatagram>) {
        this._icmp_sockets.delete(socket);
    }
    // and the others
}