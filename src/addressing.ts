import { EtherType } from "./frame.js";

declare global {
    interface Uint8Array {
        toHex(): string;
        toBinary(): string;
        toArray(): number[];
        toNumber(): number;
        toBigInt(): bigint;
    }
}
Uint8Array.prototype.toHex = function(): string {
    return Array.from(this).map((x) => Number(x).toString(16).padStart(2, "0")).join(" ");
}
Uint8Array.prototype.toBinary = function(): string {
    return Array.from(this).map((x) => Number(x).toString(2).padStart(8, "0")).join("");
}
Uint8Array.prototype.toArray = function(): number[] {
    return Array.from(this).map((x) => Number(x));
}
Uint8Array.prototype.toNumber = function(): number {
    let num = 0;
    for (let i = 0; i < this.length; i++) {
        num += this[i] * 2**(8 * (this.length - i - 1));
    }
    return num;
}
Uint8Array.prototype.toBigInt = function(): bigint {
    let num = BigInt(0);
    for (let i = 0; i < this.length; i++) {
        num += BigInt(this[i] * 2**(8 * (this.length - i - 1)));
    }
    return num;
}

// https://evanhahn.com/the-best-way-to-concatenate-uint8arrays/
/**
 * Concatenates multiple Uint8Arrays
 * @param uint8arrays the arrays to concatenate
 * @returns Concatenated Uint8Array
 */
export function concat(...uint8arrays: Uint8Array[]): Uint8Array {
    const totalLength = uint8arrays.reduce(
        (total, uint8array) => total + uint8array.byteLength, 0
    );
    const result = new Uint8Array(totalLength);
    let offset = 0;
    uint8arrays.forEach((uint8array) => {
        result.set(uint8array, offset);
        offset += uint8array.byteLength;
    });
    return result;
}

/**
 * Spreads numbers across a certain number of bits, merges them together, and splits them into an array of bytes
 * @param pairs Any number of [number to spread, number of bits to spread across] tuples
 * @returns The spread-out array of bytes
 */
export function spread(...pairs: [number, number][]): number[] {
    const values: number[] = pairs.map(x => x[0]);
    const bits: number[] = pairs.map(x => x[1]);
    const bytes = Math.floor(bits.reduce((sum, current) => sum + current, 0)/8);
    const size = pairs.length;
    let output = Array<number>(bytes);
    let current_size = 0;
    let current_ele = 0;
    let i = 0, j = 0;
    while (i<size) {
        const bits_to_push = Math.min(bits[i], 8 - current_size);
        const shift_amount = (bits_to_push >= 8) ? (bits[i] - bits_to_push) : (bits_to_push - (8 - current_size));
        const value_to_push = Math.floor(values[i] * (2**-shift_amount));
        current_size += bits_to_push;
        if (current_size == 8) {
            output[j++] = (current_ele + value_to_push);
            current_ele = 0;
            current_size = 0;
        }
        else if (current_size > 8) {
            throw Error("byte cannot exceed 8 bits. there is an error in this function.");
        }
        else {
            current_ele += value_to_push;
        }
        values[i] -= Math.floor(value_to_push * (2**shift_amount));
        // console.log(`${value_to_push} ${shift_amount} ${values[i]}`)
        bits[i] -= bits_to_push;
        if (bits[i] == 0) {
            i++;
        }
    }
    if (current_size > 0) {
        output.push(current_ele);
    }
    return output;
}

/**
 * Redraws the boundaries in an array of bytes
 * @param arr The array of bytes to divide
 * @param divisions A number array containing the lengths in bits of each division
 * @returns The divided array
 */
export function divide(arr: Uint8Array, divisions: number[]): number[] {
    let num = arr.toBigInt();
    let bits_remaining = arr.length * 8;
    let output: number[] = [];
    for (let division of divisions) {
        bits_remaining = Math.max(bits_remaining-division, 0);
        output.push(Number(num / BigInt(2**bits_remaining)));
        num &= BigInt(2**bits_remaining) - BigInt(1);
    }
    if (bits_remaining > 0) {
        let remaining_divisions = Array<number>(Math.ceil(bits_remaining/8)).fill(8);
        const last_division = bits_remaining % 8;
        remaining_divisions[remaining_divisions.length - 1] = last_division == 0 ? 8 : last_division;
        for (let division of remaining_divisions) {
            bits_remaining = Math.max(bits_remaining-division, 0);
            output.push(Number(num / BigInt(2**bits_remaining)));
            num &= BigInt(2**bits_remaining) - BigInt(1);
        }
    }
    return output;
}
/**
 * Limits the value of a number to a certain number of bits, taking from the least-significant side
 * @param num The number to limit
 * @param bits The number of bits to limit to
 * @returns The limited number
 */
export function limit(num: number, bits: number): number {
    return num & (2**bits - 1)
}
/**
 * Pads an array of bytes on the left to ensure that its length is a multiple of 4 bytes
 * @param arr The number array to pad
 * @param min_bytes The minimum number of bytes in the output (Default: 0)
 * @param max_bytes The maximum number of bytes in the output (Default: 40)
 * @returns Array of bytes with the left side padded
 */
export function padTo32BitWords(arr: number[], min_bytes: number = 0, max_bytes: number = 40): number[] {
    return Array<number>(Math.max(Math.ceil(arr.length / 4) * 4, min_bytes) - arr.length).fill(0).concat(arr).slice(0,max_bytes);
}

export interface Identifier {
    get value();
    compare(other: this): number;
}

export class DeviceID implements Identifier {
    readonly value: number;
    private static readonly min: number = 100000000;
    private static readonly max: number = 1000000000;

    public constructor(value: number) {
        value = value > DeviceID.max ? DeviceID.max : value < DeviceID.min ? DeviceID.min : Math.trunc(value);
        this.value = value;
    }

    public static rand(): number {
        return Math.floor(Math.random() * (this.max - this.min)) + this.min;
    }

    public compare(other: DeviceID): number {
        return this.value - other.value;
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
    readonly value = new Uint8Array(6);

    public constructor(arr: [number, number, number, number, number, number]) {
        this.value = this.value.map((ele, idx) => (ele = arr[idx]));
    }

    public static get byteLength(): number {
        return 6;
    }
    
    public static get broadcast(): MacAddress {
        return new MacAddress([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
    }
    
    public static get loopback(): MacAddress {
        return new MacAddress([0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    }

    public static rand(): MacAddress {
        let valid = false;
        let macArr: [number, number, number, number, number, number];
        while (!valid) {
            macArr = [
                Math.trunc(Math.random() * 256), Math.trunc(Math.random() * 256),
                Math.trunc(Math.random() * 256), Math.trunc(Math.random() * 256),
                Math.trunc(Math.random() * 256), Math.trunc(Math.random() * 256)
            ];
            if (!macArr.every((x) => x == 0xFF || x == 0x00)) {
                valid = true;
            }
        }
        return new MacAddress(macArr);
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

    public isBroadcast(): boolean {
        return this.compare(MacAddress.broadcast) == 0;
    }

    public toBinary(): string {
        return Array.from(this.value).map((x) => (x).toString(2).padStart(8, "0")).join("");
    }

    public toArray(): number[] {
        return this.value.toArray();
    }

    toString() {
        return Array.from(this.value).map((x) => (x).toString(16).padStart(2, "0")).join(":");
    }
}

export interface GeneralIpAddress {
    get value(): Uint8Array;
    get ethertype(): EtherType;
    toBinary(): string;
    toArray(): number[];
    toString(): string;
}

export class Ipv4Address implements GeneralIpAddress {
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

    public get ethertype(): EtherType {
        return EtherType.IPv4;
    }

    public static get byteLength(): number {
        return 4;
    }

    public toBinary(): string {
        // return Array.from(this._value).map((x) => (x).toString(2).padStart(8, "0")).join("");
        return this._value.toBinary();
    }

    public toArray(): number[] {
        return this._value.toArray();
    }

    toString(): string {
        return Array.from(this._value).map((x) => (x).toString()).join(".");
    }

    public and(prefix: Ipv4Prefix): Ipv4Address {
        const anded = this._value.map((x,idx) => x & prefix.mask._value[idx]);
        return new Ipv4Address([anded[0], anded[1], anded[2], anded[3]]);
    }

    public compare(other: Ipv4Address): number {
        for (let i=0; i<4; i++) {
            if (this.value[i] > other.value[i]) {
                return 1;
            }
            else if (this.value[i] < other.value[i]) {
                return -1;
            }
        }
        return 0;
    }

}

export class Ipv4Prefix {
    protected _ipv4_prefix: number;

    public constructor(ipv4_prefix: number) {
        this._ipv4_prefix = ipv4_prefix & 0x3F;
    }

    public set value(ipv4_prefix: number) {
        this._ipv4_prefix = ipv4_prefix & 0x3F;
    }

    public get value(): number {
        return this._ipv4_prefix;
    }

    public get mask(): Ipv4Address {
        let arr = spread([Math.pow(2,32-this._ipv4_prefix)-1, 32]);
        return new Ipv4Address([255-arr[0], 255-arr[1], 255-arr[2], 255-arr[3]]);
    }

    public 
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