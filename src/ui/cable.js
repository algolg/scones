class Cable {
    isOn(x, y) {
        return (y - this.start_y) / (x - this.start_x) - (this.end_y - this.start_y) / (this.end_x - this.start_x) <= 0.1;
    }
}
export {};
//# sourceMappingURL=cable.js.map