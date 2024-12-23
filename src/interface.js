"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.L3Interface = exports.L2Interface = exports.InfMatrix = exports.IdentifiedList = void 0;
const addressing_1 = require("./addressing");
const arp_1 = require("./arp");
const frame_1 = require("./frame");
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
class IdentifiedList extends Array {
    constructor() {
        super();
    }
    /**
     * Pushes an IdentifiedItem and sorts the list
     * @param item an IdentifiedItem to add
     * @returns the index of the IdentifiedItem in the sorted list
     */
    push(item) {
        super.push(item);
        super.sort((a, b) => a.compare(b));
        return super.indexOf(item);
    }
    indexOf(item) {
        let start = 0;
        let end = this.length;
        while (start <= end) {
            const mid = Math.trunc((end + start) / 2);
            const comparison = item.compare(this[mid]);
            if (comparison > 0) {
                start = mid + 1;
            }
            else if (comparison < 0) {
                end = mid - 1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }
    exists(item) {
        return this.indexOf(item) != -1;
    }
    indexOfId(id) {
        let start = 0;
        let end = this.length - 1;
        while (start <= end) {
            const mid = Math.trunc((start + end) / 2);
            const comparison = id.compare(this[mid].getId());
            if (comparison > 0) {
                start = mid + 1;
            }
            else if (comparison < 0) {
                end = mid - 1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }
    existsId(id) {
        return this.indexOfId(id) != -1;
    }
    itemFromId(id) {
        return this[this.indexOfId(id)];
    }
}
exports.IdentifiedList = IdentifiedList;
/**
 * Can IdentifiedList be rebuilt extending Map<T>?
 */
class InterfaceMatrix {
    constructor() {
        this._list = new IdentifiedList();
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
    /**
     * Determines whether an interface is currently connected to another interface
     * @param mac the MAC address of the interface to check
     * @returns true if the interface is connected to some other interface, false otherwise
     */
    isConnected(mac) {
        return this.getRow(mac).some((x) => x == 1);
    }
    /**
     * Determines whether two interfaces are connected to one another
     * @param firstMac the MAC address of the first interface
     * @param secondMac the MAC address of the second interface
     * @returns true if the two interfaces are connected to one another, false otherwise
     */
    areConnected(firstMac, secondMac) {
        return this._matrix[this._list.indexOfId(firstMac)][this._list.indexOfId(secondMac)] == 1;
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
     * @param firstMac the MAC address of the first interface
     * @param secondMac the MAC address of the second interface
     */
    connect(firstMac, secondMac) {
        const firstMac_idx = this._list.indexOfId(firstMac);
        const secondMac_idx = this._list.indexOfId(secondMac);
        if (this.isConnected(firstMac)) {
            throw `${firstMac} is already connected`;
        }
        if (this.isConnected(secondMac)) {
            throw `${secondMac} is already connected`;
        }
        if (firstMac_idx != secondMac_idx && firstMac_idx >= 0 && secondMac_idx >= 0) {
            this._matrix[firstMac_idx][secondMac_idx] = 1;
            this._matrix[secondMac_idx][firstMac_idx] = 1;
        }
        else {
            throw `Invalid MAC Addresses`;
        }
    }
    /**
     * Disconnects interface with given MAC address, and clears the device's forwarding table for routes
     * associated with the given interface
     * @param mac the MAC address of the interface to disconnect
    */
    disconnect(mac) {
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
    async send(frame, egress_mac) {
        const sender_inf = this._list.itemFromId(egress_mac);
        if (sender_inf === undefined) {
            throw Error(`sender MAC ${frame.src_mac} does not belong to an interface`);
        }
        // if the sending interface has no neighbor, then simply return
        if (!this.isConnected(egress_mac)) {
            return;
        }
        const recipient_inf = this.getNeighborInf(egress_mac);
        await recipient_inf.receive(frame, recipient_inf.mac);
        // // if the frame is a broadcast frame, it doesn't matter what the neighboring interface is
        // if (frame.dest_mac.isBroadcast()) {
        //     const recipient_inf = this.getNeighborInf(frame.src_mac);
        //     await recipient_inf.receive(frame, recipient_inf.mac);
        // }
        // else {
        //     const recipient_inf = this._list.itemFromId(frame.dest_mac);
        //     if (recipient_inf === undefined) {
        //         throw Error(`recipient MAC ${frame.dest_mac} does not belong to an interface`)
        //     }
        //     if (this.areConnected(sender_inf.mac, recipient_inf.mac)) {
        //         await recipient_inf.receive(frame, recipient_inf.mac);
        //     }
        // }
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
    constructor(network_controller, layer) {
        this._status = InfStatus.UP;
        this._vlan = null;
        this._network_controller = network_controller;
        this._layer = layer;
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
     * Sends a frame
     * @param frame the frame to send
     */
    async send(frame) {
        console.log(`--> ${this._mac}: SE ${frame.src_mac} to ${frame.dest_mac}`);
        await exports.InfMatrix.send(frame, this._mac);
    }
    /**
     * Receives a frame
     * @param frame the frame that is being received
     */
    async receive(frame, ingress_mac) {
        console.log(`--> ${this._mac}: RE ${frame.src_mac} to ${frame.dest_mac}`);
        await this._network_controller.receive(frame, ingress_mac);
    }
}
class L2Interface extends Interface {
    constructor(network_controller) {
        super(network_controller, InfLayer.L2);
        this._vlan = 1;
    }
}
exports.L2Interface = L2Interface;
class L3Interface extends Interface {
    // private _ipv6: Ipv6Address; this won't work yet
    constructor(network_controller, ipv4_arr = [0, 0, 0, 0], ipv4_prefix = 0) {
        super(network_controller, InfLayer.L3);
        this._ipv4 = new addressing_1.Ipv4Address(ipv4_arr);
        this._ipv4_prefix = new addressing_1.Ipv4Prefix(ipv4_prefix);
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
    /**
     * Sends an ARP broadcast to find the MAC Address associated with a neighbor's IPv4 address
     * @param ethertype the EtherType of the connection (is this needed?)
     * @param ip the neighbor's IPv4 address
     */
    // Note: should this function return anything? or should it just send the ARP request?
    /**
     * I'm leaning towards not returning any valid (or at least, not returning the received packet),
     * since I'd like for the frame sending/receiving mechanisms to be totally stateless (or as
     * stateless as possible, anyway).
     * The return value for the sending function should therefore be irrelevant to the frame sent.
     */
    async find(ip) {
        const arppacket = new arp_1.ArpPacket(arp_1.OP.REQUEST, this._mac, this._ipv4, addressing_1.MacAddress.broadcast, ip);
        const frame = new frame_1.Frame(addressing_1.MacAddress.broadcast, this._mac, frame_1.EtherType.ARP, arppacket.packet);
        await this.send(frame);
        return true;
    }
}
exports.L3Interface = L3Interface;
//# sourceMappingURL=interface.js.map