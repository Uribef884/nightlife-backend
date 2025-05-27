import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Club } from "./Club";
import { CartItem } from "./CartItem";

@Entity()
export class Ticket {
  @OneToMany(() => CartItem, (cartItem: CartItem) => cartItem.ticket)
  cartItems!: CartItem[];

  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column("decimal")
  price!: number;

  @Column("int")
  maxPerPerson!: number;

  @Column("int")
  priority!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column("date", { array: true, nullable: true })
  availableDates?: string[];

  @Column("int", { nullable: true })
  quantity?: number; // ✅ New field for free ticket availability

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column()
  clubId!: string;

  @ManyToOne(() => Club, (club) => club.tickets, { onDelete: "CASCADE" })
  club!: Club;
}
