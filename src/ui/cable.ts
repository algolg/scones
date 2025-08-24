import { MacAddress } from "../addressing.js";
import { ctx } from "./canvas-init.js";
import { ICON_RADIUS, ICON_SIZE } from "./variables.js";

export class Cable {
    start_x: number;
    start_y: number;
    end_x: number;
    end_y: number;

    start_inf: MacAddress;
    end_inf: MacAddress;
    start_num: number;
    end_num: number;

    public constructor(start_coords: [number, number], end_coords: [number, number], start_inf: MacAddress, end_inf: MacAddress, start_num: number, end_num: number) {
        this.start_x = start_coords[0];
        this.start_y = start_coords[1];
        this.end_x = end_coords[0];
        this.end_y = end_coords[1];

        this.start_inf = start_inf;
        this.end_inf = end_inf;
        this.start_num = start_num;
        this.end_num = end_num;
    }

    private slope(end_x: number = this.end_x, end_y: number = this.end_y): number {
        return (end_y - this.start_y) / (end_x - this.start_x);
    }

    private invSlope(end_x: number = this.end_x, end_y: number = this.end_y): number {
        return  (end_x - this.start_x) / (end_y - this.start_y);
    }

    public isOn(x: number, y: number): boolean {
        return (
            (
                (x - this.start_x > 0) != (x - this.end_x > 0) &&
                (y - this.start_y > 0) != (y - this.end_y > 0) &&
                (
                    Math.abs(Math.abs(this.slope(x,y) / (this.slope())) - 1) <= 0.1 ||
                    Math.abs(Math.abs(this.invSlope(x,y) / (this.invSlope())) - 1) <= 0.1
                )
            ) ||
            (
                Math.abs(this.slope()) <= 0.1 &&
                (x - this.start_x > 0) != (x - this.end_x > 0) &&
                Math.abs(y - (this.start_y + this.end_y)/2) <= 2
            ) ||
            (
                Math.abs(this.invSlope()) <= 0.1 &&
                (y - this.start_y > 0) != (y - this.end_y > 0) &&
                Math.abs(x - (this.start_x + this.end_x)/2) <= 2
            )
        );
    }

    public drawLabels() {
        if (!ctx) {
            return;
        }

        const angle = Math.atan2(this.end_y - this.start_y, this.end_x - this.start_x);
        const length = Math.sqrt(Math.pow(this.end_y-this.start_y, 2) + Math.pow(this.end_x-this.start_x, 2))
        const mult = Math.min(1.2, length/(ICON_RADIUS()*2.4));
        const x_adjust = Math.cos(angle) * ICON_RADIUS()*mult;
        const y_adjust = Math.sin(angle) * ICON_RADIUS()*mult;

        ctx.font = `${ICON_SIZE/4.8}px IBM Plex Sans`;
        ctx.textAlign = 'center';
        ctx.fillText(`eth${this.start_num}`, this.start_x + x_adjust, this.start_y + y_adjust);
        ctx.fillText(`eth${this.end_num}`, this.end_x - x_adjust, this.end_y - y_adjust);
    }
}

export let CableList: Cable[] = [];