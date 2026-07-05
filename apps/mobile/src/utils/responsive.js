import { Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

export const BASE_WIDTH = 430;
export const BASE_HEIGHT = 932;

export const scaleX = width / BASE_WIDTH;
export const scaleY = height / BASE_HEIGHT;
export const scale = Math.min(scaleX, scaleY);

export const sx = (value) => value * scaleX;
export const sy = (value) => value * scaleY;
export const s = (value) => value * scale;
