import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { User } from "./User";
import { Ticket } from "./Ticket";

@Entity()
export class CartItem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  sessionId?: string; // 👈 For anonymous users

  @Column()
  ticketId!: string;

  @Column({ type: 'date' }) 
  date!: Date;

  @Column()
  quantity!: number;

//  @Column("decimal", { nullable: true }) //Gotta check this when we implement dynamic pricing
//  unitPrice?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => Ticket, (ticket) => ticket.cartItems)
  ticket!: Ticket;
}
