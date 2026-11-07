import { z } from "zod";

export const businessDateSchema = z.iso.date();
