export var SockType;
(function (SockType) {
    SockType[SockType["RAW"] = 0] = "RAW";
    SockType[SockType["DGRAM"] = 1] = "DGRAM";
    SockType[SockType["STREAM"] = 2] = "STREAM";
})(SockType || (SockType = {}));
const POLLING_INTERVAL = 100;
export class Socket {
    constructor(type) {
        this._buffer = [];
        this._hits = 0;
        this._killed = false;
        this.type = type;
    }
    get hits() {
        return this._hits;
    }
    /**
     * Copies data to buffer
     * @param data to push to buffer
     */
    copy(data) {
        this._buffer.push(data);
    }
    async wait(timeout_ms) {
        return new Promise((resolve) => {
            const start = performance.now();
            const interval = setInterval(() => {
                const data_received = this._buffer.length > 0;
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
                const data_received = this._buffer.length > 0;
                const timed_out = timeout_ms ? (performance.now() - start) >= timeout_ms - POLLING_INTERVAL : false;
                if (data_received || timed_out || this._killed) {
                    clearInterval(interval);
                }
                if (data_received) {
                    const match = this._buffer.shift() ?? null;
                    resolve(match);
                }
                else if (timed_out || this._killed) {
                    resolve(null);
                }
            }, POLLING_INTERVAL);
        });
    }
    kill() {
        this._killed = true;
        this._buffer.length = 0;
        setTimeout(() => {
            this._killed = false;
        }, POLLING_INTERVAL);
    }
}
export class SocketTable {
    constructor(getL3Interfaces) {
        this.table = new Map();
        this.socket_mapping = new Map();
        this.getL3Interfaces = getL3Interfaces;
        const types = [SockType.RAW, SockType.DGRAM, SockType.STREAM];
        for (const type of types) {
            this.table.set(type, new Map());
        }
    }
    /**
     * Binds socket using address and ID information
     * @param sock The socket to bind
     * @param address For DGRAM and STREAM sockets, a local IPv4 address must be provided. For RAW sockets, a local MAC address shall be provided, or '*' to indicate listening on all interfaces.
     * @param id For DGRAM and STREAM sockets, ID is interpreted as a port number. For RAW sockets, ID must be 0.
     * @returns true if the socket was successfully bound, false otherwise
     */
    bind(sock, address, id) {
        if (this.socket_mapping.has(sock)) {
            return false;
        }
        switch (sock.type) {
            case SockType.RAW: {
                if (id !== 0) {
                    return false;
                }
                if (address !== '*') {
                    const mac = this.getL3Interfaces().findIndex((l3inf) => address === l3inf.mac_address.toString());
                    if (mac === -1) {
                        return false;
                    }
                }
                if (!this.table.get(SockType.RAW).get(address) || this.table.get(SockType.RAW).get(address).size == 0) {
                    this.table.get(SockType.RAW).set(address, new Map());
                }
                const ids = this.table.get(SockType.RAW).get(address);
                const socks = ids.get(id) ?? new Set;
                if (!ids.has(id)) {
                    ids.set(id, socks);
                }
                socks.add(sock);
                this.socket_mapping.set(sock, [address, id]);
                return true;
            }
            case SockType.DGRAM:
            case SockType.STREAM: {
                if (id <= 0 || id >= 2 ** 16) {
                    return false;
                }
                const has_ip = this.getL3Interfaces().findIndex((l3inf) => address === l3inf.ipv4_address.toString());
                if (has_ip === -1) {
                    return false;
                }
                const add_str = address.toString();
                if (!this.table.get(sock.type).get(add_str) || this.table.get(sock.type).get(add_str).size == 0) {
                    this.table.get(sock.type).set(add_str, new Map());
                }
                const ids = this.table.get(sock.type).get(add_str);
                const socks = ids.get(id);
                if (!socks) {
                    ids.set(id, new Set([sock]));
                    this.socket_mapping.set(sock, [add_str, id]);
                    return true;
                }
                else if (socks.size === 0) {
                    socks.add(sock);
                    this.socket_mapping.set(sock, [add_str, id]);
                    return true;
                }
                else if (socks.size === 1) {
                    return false;
                }
                else {
                    throw Error(`Detected ${socks.size} sockets of type ${SockType[sock.type]}`);
                }
            }
            default:
                return false;
        }
    }
    /**
     * Unbinds and clears a socket
     * @param sock The socket to unbind
     * @returns true if the socket was successfully unbound, false otherwise
     */
    close(sock) {
        const mapping = this.socket_mapping.get(sock);
        if (!mapping) {
            return false;
        }
        const [add_str, id] = mapping;
        const address_level = this.table.get(sock.type)?.get(add_str);
        if (!address_level) {
            return false;
        }
        const id_level = address_level.get(id);
        if (!id_level) {
            return false;
        }
        if (!id_level.delete(sock)) {
            return false;
        }
        this.socket_mapping.delete(sock);
        sock.kill();
        return true;
    }
    /**
     * Copies a datagram to matching sockets' buffers
     * @param data The datagram to copy to buffers
     * @param type The type of socket to match
     * @param address The address being targetted (IPv4 for DGRAM/STREAM, MAC or '*' for RAW)
     * @param id The ID to match (port number for DGRAM/STREAM, 0 for RAW)
     * @returns
     */
    incoming(data, type, address, id) {
        let total = 0;
        const socks = this.table.get(type)?.get(address)?.get(id);
        let catchall_socks = null;
        let catchall_addr = '*';
        if (type === SockType.RAW && address !== catchall_addr) {
            catchall_socks = this.table.get(SockType.RAW)?.get(catchall_addr)?.get(0) ?? null;
        }
        if (socks) {
            for (const sock of socks) {
                sock.copy(data);
            }
            total += socks.size;
        }
        if (catchall_socks) {
            for (const sock of catchall_socks) {
                sock.copy(data);
            }
            total += catchall_socks.size;
        }
        return total;
    }
    /**
     * Clears the socket table
     */
    clear() {
        const types = [SockType.RAW, SockType.DGRAM, SockType.STREAM];
        for (const type of types) {
            this.table.get(type)?.clear();
        }
        this.table.clear();
        this.socket_mapping.clear();
    }
}
//# sourceMappingURL=socket.js.map