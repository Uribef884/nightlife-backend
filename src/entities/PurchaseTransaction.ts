import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { TicketPurchase } from "./TicketPurchase";

@Entity()
export class PurchaseTransaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ nullable: true })
  userId?: string;

  @Column()
  clubId!: string;

  @Column()
  email!: string; // ✅ DO NOT leave optional — must be defined

  @Column({ type: 'date' })
  date!: Date;

  @Column("numeric")
  totalPaid!: number;

  @Column("numeric")
  clubReceives!: number;

  @Column("numeric")
  platformReceives!: number;

  @Column("numeric")
  gatewayFee!: number;

  @Column("numeric")
  gatewayIVA!: number;

  @Column("numeric", { nullable: true })
  retentionICA?: number;

  @Column("numeric", { nullable: true })
  retentionIVA?: number;

  @Column("numeric", { nullable: true })
  retentionFuente?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => TicketPurchase, (purchase) => purchase.transaction)
  purchases!: TicketPurchase[];
}
