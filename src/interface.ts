import { Identifier, Ipv4Address, Ipv4Prefix, MacAddress } from "./addressing.js";
import { ArpPacket, OP } from "./protocols/arp.js";
import { IdentifiedItem, NetworkController } from "./device.js";
import { DisplayFrame, EtherType, Frame } from "./frame.js";
import { RECORDED_FRAMES, RECORDING_ON } from "./ui/variables.js";


enum InfStatus {DOWN = 0, UP = 1}
export enum InfLayer { L2 = 2, L3 = 3 }

export class IdentifiedList<T extends IdentifiedItem> extends Array<T> {
    public constructor() {
        super();
    }

    /**
     * Pushes an IdentifiedItem and sorts the list
     * @param item An IdentifiedItem to add
     * @returns The index of the IdentifiedItem in the sorted list
     */
    public push(item: T): number {
        const idx = this.anticipatedIndexOfId(item.getId());
        super.splice(idx,0,item);
        return idx;
    }

    /**
     * Deletes an IdentifiedItem
     * @param item The IdentifiedItem to delete
     * @returns The previous index of the IdentifiedItem which was deleted
     */
    public delete(item: T): number {
        const idx = this.indexOf(item);
        if (idx != -1) {
            for (let i = idx; i < this.length - 1; i++) {
                this[i] = this[i + 1];
            }
            this.pop();
        }
        return idx;
    }

    public indexOf(item: T): number {
        let start = 0;
        let end = this.length;
        while (start <= end) {
            const mid = Math.trunc((end+start)/2);
            const comparison = item.compare(this[mid]);
            if (comparison > 0) {
                start = mid+1;
            }
            else if (comparison < 0) {
                end = mid-1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }

    public exists(item: T): boolean {
        return this.indexOf(item) != -1;
    }

    public indexOfId(id: Identifier): number {
        let start = 0;
        let end = this.length - 1;
        while (start <= end) {
            const mid = Math.trunc((start+end)/2);
            const comparison = id.compare(this[mid].getId());
            if (comparison > 0) {
                start = mid+1;
            }
            else if (comparison < 0) {
                end = mid-1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }

    public anticipatedIndexOfId(id: Identifier): number {
        if (this.length == 0) {
            return 0;
        }

        let start = 0;
        let end = this.length - 1;

        if (id.compare(this[end].getId()) > 0) {
            return this.length;
        }

        while (start <= end) {
            const mid = Math.trunc((start+end)/2);
            const comparison = id.compare(this[mid].getId());
            if (comparison > 0) {
                start = mid+1;
            }
            else if (comparison < 0) {
                end = mid-1;
            }
            else {
                return mid;
            }
        }

        const out = (end+start+1) / 2;
        if (out < 0) {
            return this.length-1;
        }
        return out;
    }

    public existsId(id: Identifier): boolean {
        return this.indexOfId(id) != -1;
    }

    /**
     * Returns the item that has a given ID
     * @param id The ID of the item to look for
     * @returns The item, if it exists. undefined otherwise.
     */
    public itemFromId(id: Identifier): T {
        const idx = this.indexOfId(id)
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
    private _list: IdentifiedList<Interface>;
    private _matrix: number[][];

    public constructor() {
        this._list = new IdentifiedList<Interface>();
        this._matrix = [];
    }

    public push(inf: Interface) {
        const idx = this._list.push(inf);
        const len = this._list.length;

        this._matrix.splice(idx,0,Array(len).fill(0));
        for (const [key, row] of this._matrix.entries()) {
            if (key == idx) {
                continue;
            }
            row.splice(idx,0,0);
        }
    }

    public delete(inf: Interface) {
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

    public exists(inf: Interface) {
        return this._list.exists(inf);
    }
    
    public existsMac(mac: MacAddress): boolean {
        return this._list.existsId(mac);
    }

    public getCoords(mac: MacAddress): [number, number] {
        const idx = this._list.indexOfId(mac)
        if (idx !== undefined) {
            return this._list[idx].coords;
        }
        return undefined;
    }

    private getRow(mac: MacAddress): number[] {
        return this._matrix[this._list.indexOfId(mac)]
    }

    /** * Returns the interface's neighbor. Returns undefined if no neighbor exists.
     * @param mac MAC address of the interface to find the neighbor of
     * @returns If the interface has a neighbor, the neighbor interface. Else, undefined.
     */
    public getNeighborInf(mac: MacAddress): Interface {
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
    public getLinkedInfs(mac: MacAddress): Interface[] {
        const row = this.getRow(mac);
        if (row !== undefined) {
            return row.filter((x) => x == 2).map((x) => this._list[x]);
        }
        return [];
    }

    private numLinks(mac: MacAddress): number {
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
    public isConnected(mac: MacAddress): boolean {
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
    private areConnected(firstMac: MacAddress, secondMac: MacAddress): boolean {
        return this._matrix[this._list.indexOfId(firstMac)][this._list.indexOfId(secondMac)] == 1;
    }

    /**
     * Connect two interfaces together, as though with a cable
     * @param firstMac the MAC address of the first interface
     * @param secondMac the MAC address of the second interface
     */
    public connect(firstMac: MacAddress, secondMac: MacAddress) {
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
    public disconnect(firstMac: MacAddress, secondMac: MacAddress) {
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

    public link(...macs: MacAddress[]) {
        for (let i=0; i < macs.length-1; i++) {
            for (let j=i+1; j < macs.length; j++) {
                const indexA = this._list.indexOfId(macs[i]);
                const indexB = this._list.indexOfId(macs[j]);
                if (indexA >= 0 && indexB >= 0) {
                    this._matrix[indexA][indexB] = 2;
                    this._matrix[indexB][indexA] = 2;
                }
            }
        }
    }

    public async send(frame: Frame, egress_mac: MacAddress): Promise<void> {
        const sender_inf = this._list.itemFromId(egress_mac);
        if (sender_inf === undefined) {
            throw Error(`sender MAC ${frame.src_mac} does not belong to an interface`)
        }

        // if the sending interface has no neighbor, then simply return
        if (!this.isConnected(egress_mac)) {
            return;
        }

        const recipient_inf = this.getNeighborInf(egress_mac);
        await recipient_inf.receive(frame, recipient_inf.mac);
    }

    public get adjacency_list(): [Interface, Interface][] {
        let adjacency_list: [Interface, Interface][] = [];
        for (let i = 0; i < this._list.length; i++) {
            for (let j = 0; j < i; j++) {
                if (this._matrix[i][j] == 1) {
                    adjacency_list.push([this._list[i], this._list[j]]);
                }
            }
        }
        return adjacency_list;
    }

    private printMatrix() {
        console.log("---------------")
        for (var line of this._matrix) {
            let linestr = " ";
            for (var ele of line) {
                linestr += `${ele} `;
            }
            console.log(linestr);
        }
        console.log("---------------")
    }

}

export const InfMatrix = new InterfaceMatrix(); 

abstract class Interface implements IdentifiedItem {
    protected readonly _mac: MacAddress;
    readonly num: number;
    protected _status: InfStatus = InfStatus.UP;
    protected _vlan: number = null;
    protected _mtu: number = 1500; // TODO: implement MTU
    protected readonly _layer: InfLayer;
    protected readonly _network_controller: NetworkController;

    public constructor(network_controller: NetworkController, layer: InfLayer, num: number, mac?: MacAddress, tracked: boolean = true) {
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

    public getId(): MacAddress {
        return this._mac;
    }

    public compare(other: Interface): number {
        return this._mac.compare(other._mac);
    }

    public get mac(): MacAddress {
        return this._mac;
    }
    public get status(): InfStatus {
        return this._status
    }
    public get vlan(): number {
        return this._vlan;
    }
    public get layer(): InfLayer {
        return this._layer;
    }
    public get coords(): [number, number] {
        return this._network_controller.coords;
    }

    public set status(status: InfStatus) {
        this._status = status;
    }

    public isUp(): boolean {
        return this._status == InfStatus.UP;
    }

    public isL2(): boolean {
        return this._layer == InfLayer.L2;
    }

    public isL3(): boolean {
        return this._layer == InfLayer.L3;
    }

    public isActive(): boolean {
        return this._status == InfStatus.UP && InfMatrix.isConnected(this._mac);
    }
    
    /**
     * Sends a frame out of this interface
     * @param frame the frame to send
     */
    public async send(frame: Frame): Promise<void> {
        console.log(`--> ${this._mac}: SE ${frame.src_mac} to ${frame.dest_mac}`)
        await InfMatrix.send(frame, this._mac);
    }

    /**
     * Receives a frame from this interface
     * @param frame the frame that is being received
     */
    public async receive(frame: Frame, ingress_mac: MacAddress): Promise<void> {
        console.log(`--> ${this._mac}: RE ${frame.src_mac} to ${frame.dest_mac}`)
        await this._network_controller.receive(frame, ingress_mac);
    }

    public clearFib() {
        this._network_controller.clearFib(this._mac);
    }
}

export class L2Interface extends Interface {

    public constructor(network_controller: NetworkController, num: number) {
        super(network_controller, InfLayer.L2, num);
        this._vlan = 1;
    }
}

export class L3Interface extends Interface {
    private _ipv4: Ipv4Address;
    private _ipv4_prefix: Ipv4Prefix;
    // private _ipv6: Ipv6Address; this won't work yet

    public constructor(network_controller: NetworkController, num: number, ipv4_arr: [number, number, number ,number] = [0,0,0,0], ipv4_prefix: number = 32, mac?: MacAddress, tracked: boolean = true) {
        super(network_controller, InfLayer.L3, num, mac, tracked);
        this._ipv4 = new Ipv4Address(ipv4_arr);
        this._ipv4_prefix = new Ipv4Prefix(ipv4_prefix);
    }

    public set ipv4(ipv4: [number, number, number, number]) {
        this._ipv4.value = ipv4;
    }

    public get ipv4(): Ipv4Address {
        return this._ipv4;
    }

    public set ipv4_prefix(ipv4_prefix: number) {
        this._ipv4_prefix.value = ipv4_prefix & 0x3F; // TODO fix this (allows prefix up to /63)
    }

    public get ipv4_prefix(): Ipv4Prefix {
        return this._ipv4_prefix;
    }

    public get ipv4_mask(): Ipv4Address {
        return this._ipv4_prefix.mask;
    }

    /**
     * Sends an ARP broadcast to find the MAC Address associated with a neighbor's IPv4 address
     * @param ethertype the EtherType of the connection (is this needed?)
     * @param ip the neighbor's IPv4 address
     */
    public find(ip: Ipv4Address): boolean {
        const arppacket = new ArpPacket(OP.REQUEST, this._mac, this._ipv4, MacAddress.broadcast, ip);
        const frame = new Frame(MacAddress.broadcast, this._mac, EtherType.ARP, arppacket.packet);
        setTimeout(() => {
            if (RECORDING_ON) {
                const timestamp = performance.now();
                RECORDED_FRAMES.push([[new DisplayFrame(frame, this._mac, () => this.coords)], timestamp]);
            }
            this.send(frame);
        }, 10)
        return true;
    }
}

export class VirtualL3Interface extends L3Interface {

    public constructor(network_controller: NetworkController, ipv4_arr: [number, number, number ,number] = [0,0,0,0], ipv4_prefix: number = 0, mac: MacAddress) {
        super(network_controller, -1, ipv4_arr, ipv4_prefix, mac, false);
    }

    public async send(frame: Frame): Promise<void> {
        console.log("sending from loopback");
        this.receive(frame, this.mac);
        return;
    }
    public async receive(frame: Frame, ingress_mac: MacAddress): Promise<void> {
        console.log("receiving from loopback");
        this._network_controller.receive(frame, ingress_mac);
        return;
    }

    public static newLoopback(network_controller: NetworkController) {
        return new VirtualL3Interface(
            network_controller, [127,0,0,1], 8, MacAddress.loopback
        );
    }

}