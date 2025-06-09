import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { TicketPurchase } from "./TicketPurchase";
import { User } from "./User";

@Entity()
export class PurchaseTransaction {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user?: User;

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

  @Column({ nullable: true, unique: true })
  paymentProviderTransactionId?: string; // Wompi or mock_txn_xxxx

  @Column({ default: "mock" })
  paymentProvider!: "mock" | "wompi" | "free";

  @Column({ default: "PENDING" }) 
  paymentStatus!: "APPROVED" | "DECLINED" | "PENDING";

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => TicketPurchase, (purchase) => purchase.transaction)
  purchases!: TicketPurchase[];

}
