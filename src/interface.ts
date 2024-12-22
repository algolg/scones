import { Ipv4Address, Ipv4Prefix, MacAddress } from "./addressing";
import { IdentifiedItem, IdentifiedList, NetworkController } from "./device";
import { EtherType } from "./frame";


enum InfStatus {DOWN = 0, UP = 1}
enum InfLayer { L2 = 2, L3 = 3 }

/**
 * Can IdentifiedList be rebuilt extending Map<T>?
 */
class InterfaceMatrix {
    private _list = new IdentifiedList<Interface>();
    private _matrix: number[][] = [];

    public push(inf: Interface) {
        const idx = this._list.push(inf);
        const len = this._list.length;
        let new_matrix: number[][] = Array.from({length: len}, () => Array(len).fill(0));

        for (var i=0; i<idx; i++) {
            new_matrix[i] = [...this._matrix[i].slice(0,idx), 0, ...this._matrix[i].slice(idx)];
        }
        for (; i<len-1; i++) {
            new_matrix[i+1] = [...this._matrix[i].slice(0,idx), 0, ...this._matrix[i].slice(idx)];
        }

        this._matrix = new_matrix;
    }

    public exists(inf: Interface) {
        return this._list.exists(inf);
    }
    
    public existsMac(mac: MacAddress): boolean {
        return this._list.existsId(mac);
    }

    // private this later
    public get list(): IdentifiedList<Interface> {
        return this._list;
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
        return this.getRow(mac).filter((x) => x == 2).map((x) => this._list[x]);
    }

    private numLinks(mac: MacAddress): number {
        return this.getRow(mac).reduce((accumulator, currentValue) => (currentValue == 2 ? accumulator + 1 : accumulator), 0);
    }

    private isConnected(mac: MacAddress): boolean {
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
    public getBroadcastDomain(mac: MacAddress): Interface[] {
        const inf: Interface = this._list.itemFromId(mac);
        /**
         * broadcast domain is made up of:
         *  - L2 ports on the same device, on the same VLAN
         *  - neighboring L2 ports on the same VLAN
         *  - neighboring L3 ports on the same subnet
         */
        const linked_neighbors = this.getLinkedInfs(mac).filter((x) => x.layer == InfLayer.L2 && x.vlan == inf.vlan);
        const direct_neighbor = [this.getNeighborInf(mac)].filter((x) =>
                ((x.layer == InfLayer.L2 && inf.layer == InfLayer.L2) && x.vlan == inf.vlan) ||
                ((x.layer == InfLayer.L2 && inf.layer == InfLayer.L3)) ||
                ((x.layer == InfLayer.L3 && inf.layer == InfLayer.L2))
        );
        return [...linked_neighbors, ...direct_neighbor];

    }

    /**
     * Connect two interfaces together, as though with a cable
     * @param a the MAC address of the first interface
     * @param b the MAC address of the second interface
     */
    public connect(a: MacAddress, b: MacAddress) {
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

} export let InfMatrix = new InterfaceMatrix();


class Interface implements IdentifiedItem {
    protected _mac: MacAddress;
    protected _status: InfStatus = InfStatus.UP;
    protected _vlan: number = null;
    protected _layer: InfLayer;
    protected _network_controller: NetworkController;

    public constructor(network_controller: NetworkController) {
        this._network_controller = network_controller;
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

    public set status(status: InfStatus) {
        this._status = status;
    }

    public isUp(): boolean {
        return this._status == InfStatus.UP;
    }

    /**
     * Sends an ARP broadcast to find the MAC Address associated with a neighbor's IPv4 address
     * @param ethertype the EtherType of the connection (is this needed?)
     * @param ip the neighbor's IPv4 address
     */
    public async find(ethertype: EtherType, ip: Ipv4Address): Promise<MacAddress> {
        // const broadcast_domain: Interface[] = InfMatrix.getBroadcastDomain(this._mac);
    }
}

export class L2Interface extends Interface {

    public constructor(network_controller: NetworkController) {
        super(network_controller);
        this._vlan = 1;
        this._layer = InfLayer.L2;
    }
}

export class L3Interface extends Interface {
    private _ipv4: Ipv4Address;
    private _ipv4_prefix: Ipv4Prefix;
    // private _ipv6: Ipv6Address; this won't work yet

    public constructor(network_controller: NetworkController) {
        super(network_controller);
        this._layer = InfLayer.L3;
    }

    public set ipv4(ipv4: Ipv4Address) {
        this._ipv4 = ipv4
    }

    public get ipv4(): Ipv4Address {
        return this._ipv4;
    }

    public set ipv4_prefix(ipv4_prefix: number) {
        this._ipv4_prefix.value = ipv4_prefix & 0x3F;
    }

    public get ipv4_prefix(): Ipv4Prefix {
        return this._ipv4_prefix;
    }

    public get ipv4_mask(): Ipv4Address {
        return this._ipv4_prefix.mask;
    }
}