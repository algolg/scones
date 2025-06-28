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
    Protocol[Protocol["ARP"] = 2] = "ARP";
    Protocol[Protocol["TCP"] = 3] = "TCP";
    Protocol[Protocol["UDP"] = 4] = "UDP";
})(Protocol || (Protocol = {}));
;
const POLLING_INTERVAL = 100;
export class Socket {
    constructor(protocol, direction, check_function, action = Action.ACCEPT) {
        this._createResponse = (packet) => null;
        this._matched = [];
        this._hits = 0;
        this._killed = false;
        this.protocol = protocol;
        this.direction = direction;
        this._check = check_function;
        this.action = action;
    }
    get hits() {
        return this._hits;
    }
    async wait(timeout_ms) {
        return new Promise((resolve) => {
            const start = performance.now();
            const interval = setInterval(() => {
                const data_received = this._matched.length > 0;
                const timed_out = timeout_ms ? (performance.now() - start) >= timeout_ms - POLLING_INTERVAL : false;
                if (data_received || timed_out || this._killed) {
                    clearInterval(interval);
                    resolve();
                }
            }, POLLING_INTERVAL);
        });
    }
    async receive(timeout_ms) {
        return new Promise((resolve) => {
            const start = performance.now();
            const interval = setInterval(() => {
                const data_received = this._matched.length > 0;
                const timed_out = timeout_ms ? (performance.now() - start) >= timeout_ms - POLLING_INTERVAL : false;
                if (data_received || timed_out || this._killed) {
                    clearInterval(interval);
                }
                if (data_received) {
                    const match = this._matched.shift();
                    resolve(match);
                }
                else if (timed_out || this._killed) {
                    resolve(null);
                }
            }, POLLING_INTERVAL);
        });
    }
    check(protocol_data, packet) {
        if (this._check(protocol_data, packet)) {
            this._matched.push([protocol_data, packet]);
            this._hits++;
            return true;
        }
        return false;
    }
    get matched_top() {
        if (this._matched.length > 0) {
            return this._matched.shift();
        }
        else {
            return null;
        }
    }
    kill() {
        this._killed = true;
        setTimeout(() => {
            this._killed = false;
        }, POLLING_INTERVAL);
    }
    createResponse(packet) {
        return this._createResponse(packet);
    }
    static icmpSocketFrom(echo_request, echo_packet) {
        return new Socket(Protocol.ICMP, Direction.IN, (icmp_datagram, ipv4_packet) => {
            return (icmp_datagram.matchesRequest(echo_request)
                && echo_packet.src.compare(ipv4_packet.dest) == 0
                && echo_packet.dest.compare(ipv4_packet.src) == 0) || (!icmp_datagram.isEchoReply && !icmp_datagram.isEchoRequest &&
                icmp_datagram.data.slice(echo_packet.ihl * 4).every((x, idx) => x == echo_packet.data[idx]));
        });
    }
    static udpSocket(ipv4_address, port_num) {
        const ip_check = (ipv4_packet) => { if (ipv4_address) {
            return ipv4_address.isBroadcast() || ipv4_packet.dest.compare(ipv4_address) == 0;
        }
        else {
            return true;
        } };
        return new Socket(Protocol.UDP, Direction.IN, (udp_datagram, ipv4_packet) => {
            return ip_check(ipv4_packet) && udp_datagram.dest_port == port_num;
        });
    }
    ;
}
export class SocketTable {
    constructor() {
        this._ipv4_sockets = new Set();
        this._icmp_sockets = new Set();
        this._udp_sockets = new Set();
    }
    // and the others
    addIpv4Socket(socket) {
        this._ipv4_sockets.add(socket);
    }
    addIcmpSocket(socket) {
        this._icmp_sockets.add(socket);
    }
    addUdpSocket(socket) {
        this._udp_sockets.add(socket);
    }
    getIpv4Sockets() {
        return this._ipv4_sockets;
    }
    getIcmpSockets() {
        return this._icmp_sockets;
    }
    getUdpSockets() {
        return this._udp_sockets;
    }
    deleteIpv4Socket(socket) {
        this._ipv4_sockets.delete(socket);
    }
    deleteIcmpSocket(socket) {
        this._icmp_sockets.delete(socket);
    }
    deleteUdpSocket(socket) {
        this._udp_sockets.delete(socket);
    }
    // and the others
    clear() {
        this._ipv4_sockets.clear();
        this._icmp_sockets.clear();
        this._udp_sockets.clear();
        // and the others
    }
}
//# sourceMappingURL=socket.js.map