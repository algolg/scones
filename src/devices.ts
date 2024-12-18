import { MacAddress, Ipv4Address, Identifier, DeviceID } from "./addressing.js";

export interface Device {}

export enum InfStatus {DOWN = 0, UP = 1}

interface IdentifiedItem {
    getId(): Identifier;
    compare(other: IdentifiedItem): number;
}

class IdentifiedList<T extends IdentifiedItem> extends Array<T> {
    /**
     * Pushes an IdentifiedItem and sorts the list
     * @param item an IdentifiedItem to add
     * @returns the index of the IdentifiedItem in the sorted list
     */
    public push(item: T): number {
        super.push(item);
        super.sort((a,b) => a.compare(b))
        return super.indexOf(item);
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
            const comparison = id.compare(this[mid].getId()); // see why compare works w/o .getId()
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

    public existsId(id: Identifier): boolean {
        return this.indexOfId(id) != -1;
    }
}

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

    public connect(a: MacAddress, b: MacAddress) {
        const indexA = this._list.indexOfId(a);
        const indexB = this._list.indexOfId(b);
        if (indexA != indexB && indexA >= 0 && indexB >= 0) {
            this._matrix[indexA][indexB] = 1;
            this._matrix[indexB][indexA] = 1;
        }
        else {
            throw `Invalid MAC Addresses`;
        }
        this.printMatrix();
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

} let InfMatrix = new InterfaceMatrix();

class Interface implements IdentifiedItem {
    protected _mac: MacAddress;
    protected _status: InfStatus = InfStatus.UP;

    public constructor() {
        let assigned = false;
        while (!assigned) {
            const mac: [number, number, number, number, number, number] = [
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)
            ];
            if (!InfMatrix.existsMac(new MacAddress(mac))) {
                this._mac = new MacAddress(mac);
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

    public set status(status: InfStatus) {
        this._status = status;
    }

    public isUp(): boolean {
        return this._status == InfStatus.UP;
    }
}

class L2Interface extends Interface {
    private _vlan: number = 1;
}

class L3Interface extends Interface {
    private _ipv4: Ipv4Address;
}

class Computer implements IdentifiedItem, Device {
    private _inf: L3Interface = new L3Interface();
    private _id: DeviceID;

    public get inf(): L3Interface {
        return this._inf;
    }

    public compare(other: Computer): number {
        return this._id.value - other._id.value;
    }
    public getId(): Identifier {
        return this._id;
    }
}

const pc1 = new Computer();
InfMatrix.list.forEach(x => console.log(`- ${x.mac}`));
const pc2 = new Computer();
InfMatrix.list.forEach(x => console.log(`- ${x.mac}`));
InfMatrix.connect(pc1.inf.mac, pc2.inf.mac);
const pc3 = new Computer();
const pc4 = new Computer();
const pc5 = new Computer();
InfMatrix.list.forEach(x => console.log(`- ${x.mac}`));
InfMatrix.connect(pc3.inf.mac, pc5.inf.mac);