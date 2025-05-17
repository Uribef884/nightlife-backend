import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./User";
import { Ticket } from "./Ticket";

@Entity()
export class CartItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  @ManyToOne(() => Ticket, { eager: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "ticketId" })
  ticket!: Ticket;

  @Column()
  ticketId!: string;

  @Column()
  date!: string; // e.g., "2025-05-24"

  @Column()
  quantity!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
