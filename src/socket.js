export var Action;
(function (Action) {
    Action[Action["BLOCK"] = 0] = "BLOCK";
    Action[Action["ACCEPT"] = 1] = "ACCEPT";
    Action[Action["SEND"] = 2] = "SEND"; /*?*/
})(Action || (Action = {}));
;
export var Direction;
(function (Direction) {
    Direction[Direction["EITHER"] = 0] = "EITHER";
    Direction[Direction["IN"] = 1] = "IN";
    Direction[Direction["OUT"] = 2] = "OUT";
})(Direction || (Direction = {}));
;
export var Protocol;
(function (Protocol) {
    Protocol[Protocol["IPv4"] = 0] = "IPv4";
    Protocol[Protocol["ICMP"] = 1] = "ICMP";
    Protocol[Protocol["TCP"] = 2] = "TCP";
    Protocol[Protocol["UDP"] = 3] = "UDP";
})(Protocol || (Protocol = {}));
;
export class Socket {
    constructor(protocol, direction, check_function, action = Action.ACCEPT) {
        this._createResponse = (packet) => undefined;
        this._matched = new Set();
        this._hits = 0;
        this.protocol = protocol;
        this.direction = direction;
        this._check = check_function;
        this.action = action;
    }
    get hits() {
        return this._hits;
    }
    check(protocol_data, packet) {
        if (this._check(protocol_data, packet)) {
            this._matched.add(protocol_data);
            this._hits++;
            return true;
        }
        return false;
    }
    get matched_top() {
        if (this._matched.size > 0) {
            const ele = this._matched.values().next().value;
            this._matched.delete(ele);
            return ele;
        }
        else {
            return undefined;
        }
    }
    createResponse(packet) {
        return this._createResponse(packet);
    }
    static icmpSocketFrom(echo_request, echo_packet) {
        return new Socket(Protocol.ICMP, Direction.IN, (icmp_datagram, ipv4_packet) => {
            return (icmp_datagram.matchesRequest(echo_request)
                && echo_packet.src.compare(ipv4_packet.dest) == 0
                && echo_packet.dest.compare(ipv4_packet.src) == 0) || (!icmp_datagram.isEchoReply && !icmp_datagram.isEchoRequest &&
                icmp_datagram.data.every((x, idx) => x == echo_packet.packet[idx]));
        });
    }
}
export class SocketTable {
    constructor() {
        this._ipv4_sockets = new Set();
        this._icmp_sockets = new Set();
        // and the others
    }
    // and the others
    addIpv4Socket(socket) {
        this._ipv4_sockets.add(socket);
    }
    addIcmpSocket(socket) {
        this._icmp_sockets.add(socket);
    }
    getIpv4Sockets() {
        return this._ipv4_sockets;
    }
    getIcmpSockets() {
        return this._icmp_sockets;
    }
    deleteIpv4Socket(socket) {
        this._ipv4_sockets.delete(socket);
    }
    deleteIcmpSocket(socket) {
        this._icmp_sockets.delete(socket);
    }
}
//# sourceMappingURL=socket.js.map