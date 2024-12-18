"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InfStatus = void 0;
const addressing_js_1 = require("./addressing.js");
var InfStatus;
(function (InfStatus) {
    InfStatus[InfStatus["DOWN"] = 0] = "DOWN";
    InfStatus[InfStatus["UP"] = 1] = "UP";
})(InfStatus || (exports.InfStatus = InfStatus = {}));
class IdentifiedList extends Array {
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
            const comparison = id.compare(this[mid].getId()); // see why compare works w/o .getId()
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
}
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
    connect(a, b) {
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
let InfMatrix = new InterfaceMatrix();
class Interface {
    constructor() {
        this._status = InfStatus.UP;
        let assigned = false;
        while (!assigned) {
            const mac = [
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256),
                Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)
            ];
            if (!InfMatrix.existsMac(new addressing_js_1.MacAddress(mac))) {
                this._mac = new addressing_js_1.MacAddress(mac);
                InfMatrix.push(this);
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
    set status(status) {
        this._status = status;
    }
    isUp() {
        return this._status == InfStatus.UP;
    }
}
class L2Interface extends Interface {
    constructor() {
        super(...arguments);
        this._vlan = 1;
    }
}
class L3Interface extends Interface {
}
class Computer {
    constructor() {
        this._inf = new L3Interface();
    }
    get inf() {
        return this._inf;
    }
    compare(other) {
        return this._id.value - other._id.value;
    }
    getId() {
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
//# sourceMappingURL=devices.js.map