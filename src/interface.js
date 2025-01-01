import { Ipv4Address, Ipv4Prefix, MacAddress } from "./addressing.js";
import { ArpPacket, OP } from "./arp.js";
import { EtherType, Frame } from "./frame.js";
var InfStatus;
(function (InfStatus) {
    InfStatus[InfStatus["DOWN"] = 0] = "DOWN";
    InfStatus[InfStatus["UP"] = 1] = "UP";
})(InfStatus || (InfStatus = {}));
export var InfLayer;
(function (InfLayer) {
    InfLayer[InfLayer["L2"] = 2] = "L2";
    InfLayer[InfLayer["L3"] = 3] = "L3";
})(InfLayer || (InfLayer = {}));
export class IdentifiedList extends Array {
    constructor() {
        super();
    }
    /**
     * Pushes an IdentifiedItem and sorts the list
     * @param item An IdentifiedItem to add
     * @returns The index of the IdentifiedItem in the sorted list
     */
    push(item) {
        super.push(item);
        super.sort((a, b) => a.compare(b));
        return super.indexOf(item);
    }
    /**
     * Deletes an IdentifiedItem
     * @param item The IdentifiedItem to delete
     * @returns The previous index of the IdentifiedItem which was deleted
     */
    delete(item) {
        const idx = this.indexOf(item);
        if (idx != -1) {
            for (let i = idx; i < this.length - 1; i++) {
                this[i] = this[i + 1];
            }
            this.pop();
        }
        return idx;
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
    /**
     * Returns the item that has a given ID
     * @param id The ID of the item to look for
     * @returns The item, if it exists. undefined otherwise.
     */
    itemFromId(id) {
        const idx = this.indexOfId(id);
        if (idx != -1) {
            return this[idx];
        }
        return undefined;
    }
}
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
    delete(inf) {
        const idx = this._list.delete(inf);
        if (idx != -1) {
            for (let i = idx; i < this._matrix.length - 1; i++) {
                this._matrix[i] = this._matrix[i + 1];
            }
            this._matrix.pop();
            for (let row of this._matrix) {
                for (let i = idx; i < row.length - 1; i++) {
                    row[i] = row[i + 1];
                }
                row.pop();
            }
        }
    }
    exists(inf) {
        return this._list.exists(inf);
    }
    existsMac(mac) {
        return this._list.existsId(mac);
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
        const row = this.getRow(mac);
        if (row !== undefined) {
            return row.filter((x) => x == 2).map((x) => this._list[x]);
        }
        return [];
    }
    numLinks(mac) {
        const row = this.getRow(mac);
        if (row !== undefined) {
            return row.reduce((accumulator, currentValue) => (currentValue == 2 ? accumulator + 1 : accumulator), 0);
        }
        return -1;
    }
    /**
     * Determines whether an interface is currently connected to another interface
     * @param mac the MAC address of the interface to check
     * @returns true if the interface is connected to some other interface, false otherwise
     */
    isConnected(mac) {
        const row = this.getRow(mac);
        if (row !== undefined) {
            return row.some((x) => x == 1);
        }
        return false;
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
     * Connect two interfaces together, as though with a cable
     * @param firstMac the MAC address of the first interface
     * @param secondMac the MAC address of the second interface
     */
    connect(firstMac, secondMac) {
        if (this.isConnected(firstMac)) {
            throw `${firstMac} is already connected`;
        }
        if (this.isConnected(secondMac)) {
            throw `${secondMac} is already connected`;
        }
        const firstMac_idx = this._list.indexOfId(firstMac);
        const secondMac_idx = this._list.indexOfId(secondMac);
        if (firstMac_idx != secondMac_idx && firstMac_idx >= 0 && secondMac_idx >= 0 && this._matrix[firstMac_idx][secondMac_idx] == 0) {
            this._matrix[firstMac_idx][secondMac_idx] = 1;
            this._matrix[secondMac_idx][firstMac_idx] = 1;
        }
        else {
            throw `Invalid MAC Addresses`;
        }
    }
    /**
     * Disconnects two interfaces and clears the devices' forwarding table for routes associated with the given interfaces
     * @param firstMac the MAC address of the first interface
     * @param secondMac the MAC address of the second interface
    */
    disconnect(firstMac, secondMac) {
        const firstMac_idx = this._list.indexOfId(firstMac);
        const secondMac_idx = this._list.indexOfId(secondMac);
        if (firstMac_idx != secondMac_idx && firstMac_idx >= 0 && secondMac_idx >= 0 && this._matrix[firstMac_idx][secondMac_idx] == 1) {
            this._matrix[firstMac_idx][secondMac_idx] = 0;
            this._matrix[secondMac_idx][firstMac_idx] = 0;
            const firstInf = this._list.itemFromId(firstMac);
            const secondInf = this._list.itemFromId(secondMac);
            firstInf.clearFib();
            secondInf.clearFib();
        }
        else {
            throw `Invalid MAC Addresses`;
        }
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
    }
    get adjacency_list() {
        let adjacency_list = [];
        for (let i = 0; i < this._list.length; i++) {
            for (let j = 0; j < i; j++) {
                if (this._matrix[i][j] == 1) {
                    adjacency_list.push([this._list[i], this._list[j]]);
                }
            }
        }
        return adjacency_list;
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
export const InfMatrix = new InterfaceMatrix();
class Interface {
    constructor(network_controller, layer, num, mac, tracked = true) {
        this._status = InfStatus.UP;
        this._vlan = null;
        this._network_controller = network_controller;
        this._layer = layer;
        this.num = num;
        if (tracked) {
            let assigned = false;
            while (!assigned) {
                const mac = MacAddress.rand();
                if (!InfMatrix.existsMac(mac)) {
                    this._mac = mac;
                    InfMatrix.push(this);
                    assigned = true;
                }
            }
        }
        else {
            this._mac = mac;
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
    get coords() {
        return this._network_controller.coords;
    }
    set status(status) {
        this._status = status;
    }
    isUp() {
        return this._status == InfStatus.UP;
    }
    isL2() {
        return this._layer == InfLayer.L2;
    }
    isL3() {
        return this._layer == InfLayer.L3;
    }
    isActive() {
        return this._status == InfStatus.UP && InfMatrix.isConnected(this._mac);
    }
    /**
     * Sends a frame out of this interface
     * @param frame the frame to send
     */
    async send(frame) {
        console.log(`--> ${this._mac}: SE ${frame.src_mac} to ${frame.dest_mac}`);
        await InfMatrix.send(frame, this._mac);
    }
    /**
     * Receives a frame from this interface
     * @param frame the frame that is being received
     */
    async receive(frame, ingress_mac) {
        console.log(`--> ${this._mac}: RE ${frame.src_mac} to ${frame.dest_mac}`);
        await this._network_controller.receive(frame, ingress_mac);
    }
    clearFib() {
        this._network_controller.clearFib(this._mac);
    }
}
export class L2Interface extends Interface {
    constructor(network_controller, num) {
        super(network_controller, InfLayer.L2, num);
        this._vlan = 1;
    }
}
export class L3Interface extends Interface {
    // private _ipv6: Ipv6Address; this won't work yet
    constructor(network_controller, num, ipv4_arr = [0, 0, 0, 0], ipv4_prefix = 0, mac, tracked = true) {
        super(network_controller, InfLayer.L3, num, mac, tracked);
        this._ipv4 = new Ipv4Address(ipv4_arr);
        this._ipv4_prefix = new Ipv4Prefix(ipv4_prefix);
    }
    set ipv4(ipv4) {
        this._ipv4.value = ipv4;
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
    find(ip) {
        const arppacket = new ArpPacket(OP.REQUEST, this._mac, this._ipv4, MacAddress.broadcast, ip);
        const frame = new Frame(MacAddress.broadcast, this._mac, EtherType.ARP, arppacket.packet);
        setTimeout(() => {
            this.send(frame);
        }, 10);
        return true;
    }
}
export class VirtualL3Interface extends L3Interface {
    constructor(network_controller, ipv4_arr = [0, 0, 0, 0], ipv4_prefix = 0, mac) {
        super(network_controller, -1, ipv4_arr, ipv4_prefix, mac, false);
    }
    async send(frame) {
        this.receive(frame, this.mac);
        return;
    }
    async receive(frame, ingress_mac) {
        this._network_controller.receive(frame, ingress_mac);
        return;
    }
    static newLoopback(network_controller) {
        return new VirtualL3Interface(network_controller, [127, 0, 0, 1], 8, MacAddress.loopback);
    }
}
//# sourceMappingURL=interface.js.map