declare global {
    interface Uint8Array {
        toBinary(): string;
    }
}
Uint8Array.prototype.toBinary = function(): string {
    return Array.from(this).map((x) => Number(x).toString(2).padStart(8, "0")).join("");
}

export interface Identifier {
    compare(other: this): number;
}

export class DeviceID implements Identifier {
    private _value: number;

    public get value() {
        return this._value;
    }

    public compare(other: DeviceID): number {
        return this._value - other._value;
    }
}

class Uint8 {
    private _value: number;

    public constructor(value: number) {
        this._value = value & 0xFF;
    }

    public set value(value: number) {
        this._value = value & 0xFF;
    }

    public get value(): number {
        return this._value;
    }

    public toBinary(): string {
        return this._value.toString(2).padStart(8,"0");
    }

    toString() {
        return this._value;
    }
}

export class MacAddress implements Identifier {
    private _value = new Uint8Array(6);

    public constructor(arr: [number, number, number, number, number, number]) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }

    public set value(arr: [number, number, number, number, number, number]) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }

    public get value(): Uint8Array {
        return this._value;
    }

    public compare(other: MacAddress): number {
        for (let i=0; i<6; i++) {
            if (this.value[i] > other.value[i]) {
                return 1;
            }
            else if (this.value[i] < other.value[i]) {
                return -1;
            }
        }
        return 0;
    }

    public toBinary(): string {
        return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
    }

    toString() {
        return Array.from(this._value).map((x) => (x).toString(16).padStart(2, "0")).join(":");
    }
}

export class Ipv4Address {
    private _value = new Uint8Array(4);

    public constructor(arr: [number, number, number, number]) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }

    public set value(arr: [number, number, number, number]) {
        this._value = this._value.map((ele, idx) => (ele = arr[idx]));
    }

    public get value(): Uint8Array {
        return this._value;
    }

    public toBinary(): string {
        // return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
        return this._value.toBinary();
    }

    toString() {
        return Array.from(this._value).map((x) => (x).toString()).join(".");
    }
}

export class Ipv4Packet {
    private _header = new Uint8Array(20);
    private _data: Uint8Array;

    public constructor(sourceIPv4: Ipv4Address, destinationIPv4: Ipv4Address) {
        this._header[0] = (4 << 4) + (5 /* + options.length/4 */);
        this._header[1] = 0; // temp
        // splitting total length into two bytes
        this._header[2] = (20 /* + options.length + data.length*/) >> 8;
        this._header[3] = (20 /* + options.length + data.length*/) & 0b11111111;
        // there's more
        sourceIPv4.value.forEach((ele, idx) => (this._header[12+idx] = ele));
        destinationIPv4.value.forEach((ele, idx) => (this._header[16+idx] = ele));
    }

    public get packet_length(): number {
        return (this._header[2] << 8) + this._header[3];
    }
}

function main() {
    let test = new Uint8(10);
    console.log(`${test}\t${test.toBinary()}`)
    test.value = 255;
    console.log(`${test}\t${test.toBinary()}`)
    test.value = 300.7;
    console.log(`${test}\t${test.toBinary()}`)

    let testmac = new MacAddress([0x9c, 0x00, 0xcd, 0x61, 0x39, 0x48])
    console.log(`${testmac}\t${testmac.toBinary().match(/.{1,4}/g).join(' ')}`);

    let testipv4 = new Ipv4Address([192, 168, 0, 10])
    console.log(`${testipv4}\t\t${testipv4.toBinary().match(/.{1,4}/g).join(' ')}`);

    let testuint8array = new Uint8Array([1,4,8,16]);
    console.log(`${testuint8array}\t\t${testuint8array.toBinary()}`)
}
// main();