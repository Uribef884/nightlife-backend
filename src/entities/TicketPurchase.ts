import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Ticket } from "./Ticket";
import { User } from "./User";
import { Club } from "./Club";

@Entity()
export class TicketPurchase {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // ✅ Link to the purchased ticket
  @ManyToOne(() => Ticket, { eager: true })
  @JoinColumn({ name: "ticketId" })
  ticket!: Ticket;

  @Column()
  ticketId!: string;

  // ✅ Optional reference to the user (nullable for anonymous)
  @ManyToOne(() => User, { nullable: true, eager: false })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  // ✅ Club reference for querying/reporting
  @ManyToOne(() => Club, { eager: false })
  @JoinColumn({ name: "clubId" })
  club!: Club;

  @Column()
  clubId!: string;

  // ✅ Date of use (not purchase date!)
  @Column()
  date!: string; // e.g. "2025-05-10"

  // ✅ Buyer input per ticket (optional)
  @Column({ nullable: true })
  buyerName?: string;

  @Column({ nullable: true })
  buyerIdNumber?: string;

  // ✅ Encrypted QR Code string
  @Column()
  qrCodeEncrypted!: string;

  @Column({ default: false })
  isUsed!: boolean;

  @Column({ type: "timestamp", nullable: true })
  usedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
