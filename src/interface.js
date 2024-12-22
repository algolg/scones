"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.L3Interface = exports.L2Interface = exports.InfMatrix = void 0;
const addressing_1 = require("./addressing");
const device_1 = require("./device");
var InfStatus;
(function (InfStatus) {
    InfStatus[InfStatus["DOWN"] = 0] = "DOWN";
    InfStatus[InfStatus["UP"] = 1] = "UP";
})(InfStatus || (InfStatus = {}));
var InfLayer;
(function (InfLayer) {
    InfLayer[InfLayer["L2"] = 2] = "L2";
    InfLayer[InfLayer["L3"] = 3] = "L3";
})(InfLayer || (InfLayer = {}));
/**
 * Can IdentifiedList be rebuilt extending Map<T>?
 */
class InterfaceMatrix {
    constructor() {
        this._list = new device_1.IdentifiedList();
        this._matrix = [];
    }
    push(inf) {
        const idx = this._list.push(inf);
        const len = this._list.length;
        let new_matrix = Array.from({ length: len }, () => Array(len).fill(0));
        for (var i = 0; i < idx; i++) {
            new_matrix[i] = [...this._matrix[i].slice(0, idx), 0, ...this._matrix[i].slice(idx)];
        }
        for (; i < len - 1; i++) {
            new_matrix[i + 1] = [...this._matrix[i].slice(0, idx), 0, ...this._matrix[i].slice(idx)];
        }
        this._matrix = new_matrix;
    }
    exists(inf) {
        return this._list.exists(inf);
    }
    existsMac(mac) {
        return this._list.existsId(mac);
    }
    // private this later
    get list() {
        return this._list;
    }
    getRow(mac) {
        return this._matrix[this._list.indexOfId(mac)];
    }
    /** * Returns the interface's neighbor. Returns undefined if no neighbor exists.
     * @param mac MAC address of the interface to find the neighbor of
     * @returns If the interface has a neighbor, the neighbor interface. Else, undefined.
     */
    getNeighborInf(mac) {
        const try_neighbor_idx = this.getRow(mac).indexOf(1);
        if (try_neighbor_idx == -1) {
            return undefined;
        }
        return this._list[try_neighbor_idx];
    }
    /** * Returns the interfaces on the same device
     * @param mac MAC address of the interface to find the linked interfaces of
     * @returns All linked interfaces, if any
     */
    getLinkedInfs(mac) {
        return this.getRow(mac).filter((x) => x == 2).map((x) => this._list[x]);
    }
    numLinks(mac) {
        return this.getRow(mac).reduce((accumulator, currentValue) => (currentValue == 2 ? accumulator + 1 : accumulator), 0);
    }
    isConnected(mac) {
        return this.getRow(mac).some((x) => x == 1);
    }
    /**
     * NOTE: Consider moving away from this function. It is unrealistic.
     * Ideally, an ARP broadcast would be modeled by ensuring that each device, upon receiving a broadcast frame,
     *       forwards the broadcast frame out of all ports (in the broadcast domain) except for the ingress.
     * Hence, the network will not "know" what the whole broadcast domain is, but the broadcast will operate.
     * i think...
     * This function would also (probably) have to be recursive, which I don't really want.
     * Could instead use Promise.all(...) to forward/send broadcast out of all (non-ingress) interfaces.
     * @param mac
     * @returns
     */
    getBroadcastDomain(mac) {
        const inf = this._list.itemFromId(mac);
        /**
         * broadcast domain is made up of:
         *  - L2 ports on the same device, on the same VLAN
         *  - neighboring L2 ports on the same VLAN
         *  - neighboring L3 ports on the same subnet
         */
        const linked_neighbors = this.getLinkedInfs(mac).filter((x) => x.layer == InfLayer.L2 && x.vlan == inf.vlan);
        const direct_neighbor = [this.getNeighborInf(mac)].filter((x) => ((x.layer == InfLayer.L2 && inf.layer == InfLayer.L2) && x.vlan == inf.vlan) ||
            ((x.layer == InfLayer.L2 && inf.layer == InfLayer.L3)) ||
            ((x.layer == InfLayer.L3 && inf.layer == InfLayer.L2)));
        return [...linked_neighbors, ...direct_neighbor];
    }
    /**
     * Connect two interfaces together, as though with a cable
     * @param a the MAC address of the first interface
     * @param b the MAC address of the second interface
     */
    connect(a, b) {
        const indexA = this._list.indexOfId(a);
        const indexB = this._list.indexOfId(b);
        if (this.isConnected(a)) {
            throw `${a} is already connected`;
        }
        if (this.isConnected(b)) {
            throw `${b} is already connected`;
        }
        if (indexA != indexB && indexA >= 0 && indexB >= 0) {
            this._matrix[indexA][indexB] = 1;
            this._matrix[indexB][indexA] = 1;
        }
        else {
            throw `Invalid MAC Addresses`;
        }
        this.printMatrix();
    }
    link(...macs) {
        for (let i = 0; i < macs.length - 1; i++) {
            for (let j = i + 1; j < macs.length; j++) {
                const indexA = this._list.indexOfId(macs[i]);
                const indexB = this._list.indexOfId(macs[j]);
                if (indexA >= 0 && indexB >= 0) {
                    this._matrix[indexA][indexB] = 2;
                    this._matrix[indexB][indexA] = 2;
                }
            }
        }
    }
    printMatrix() {
        console.log("---------------");
        for (var line of this._matrix) {
            let linestr = " ";
            for (var ele of line) {
                linestr += `${ele} `;
            }
            console.log(linestr);
        }
        console.log("---------------");
    }
}
exports.InfMatrix = new InterfaceMatrix();
class Interface {
    constructor(network_controller) {
        this._status = InfStatus.UP;
        this._vlan = null;
        this._network_controller = network_controller;
        let assigned = false;
        while (!assigned) {
            const mac = addressing_1.MacAddress.rand();
            if (!exports.InfMatrix.existsMac(mac)) {
                this._mac = mac;
                exports.InfMatrix.push(this);
                assigned = true;
            }
        }
    }
    getId() {
        return this._mac;
    }
    compare(other) {
        return this._mac.compare(other._mac);
    }
    get mac() {
        return this._mac;
    }
    get status() {
        return this._status;
    }
    get vlan() {
        return this._vlan;
    }
    get layer() {
        return this._layer;
    }
    set status(status) {
        this._status = status;
    }
    isUp() {
        return this._status == InfStatus.UP;
    }
    /**
     * Sends an ARP broadcast to find the MAC Address associated with a neighbor's IPv4 address
     * @param ethertype the EtherType of the connection (is this needed?)
     * @param ip the neighbor's IPv4 address
     */
    async find(ethertype, ip) {
        // const broadcast_domain: Interface[] = InfMatrix.getBroadcastDomain(this._mac);
    }
}
class L2Interface extends Interface {
    constructor(network_controller) {
        super(network_controller);
        this._vlan = 1;
        this._layer = InfLayer.L2;
    }
}
exports.L2Interface = L2Interface;
class L3Interface extends Interface {
    // private _ipv6: Ipv6Address; this won't work yet
    constructor(network_controller) {
        super(network_controller);
        this._layer = InfLayer.L3;
    }
    set ipv4(ipv4) {
        this._ipv4 = ipv4;
    }
    get ipv4() {
        return this._ipv4;
    }
    set ipv4_prefix(ipv4_prefix) {
        this._ipv4_prefix.value = ipv4_prefix & 0x3F;
    }
    get ipv4_prefix() {
        return this._ipv4_prefix;
    }
    get ipv4_mask() {
        return this._ipv4_prefix.mask;
    }
}
exports.L3Interface = L3Interface;
//# sourceMappingURL=interface.js.map