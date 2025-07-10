import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { MenuPurchase } from './MenuPurchase';
import { User } from "./User";

@Entity()
export class MenuPurchaseTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column({ nullable: true })
  userId?: string;

  @Column({ nullable: true })
  sessionId?: string;

  @Column()
  clubId!: string;

  @Column('decimal')
  totalPaid!: number;

  @Column('decimal')
  clubReceives!: number;

  @Column('decimal')
  platformReceives!: number;

  @Column()
  email!: string; // ✅ DO NOT leave optional — must be defined

  @Column({ nullable: true, unique: true })
  paymentProviderTransactionId?: string; // Wompi or mock_txn_xxxx

  @Column({ default: "mock" })
  paymentProvider!: "mock" | "wompi";

  @Column({ default: "PENDING" })
  paymentStatus!: "APPROVED" | "DECLINED" | "PENDING";

  @Column('decimal')
  gatewayFee!: number;

  @Column('decimal')
  gatewayIVA!: number;

  @Column("numeric", { nullable: true })
  retentionICA?: number;

  @Column("numeric", { nullable: true })
  retentionIVA?: number;

  @Column("numeric", { nullable: true })
  retentionFuente?: number;

  @Column('text')
  qrPayload!: string;

  @Column({ default: false })
  isUsed!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt?: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @OneToMany(() => MenuPurchase, (purchase) => purchase.transaction, {
    cascade: true,
    onDelete: "CASCADE", // ✅ THIS IS CRUCIAL
  })
  purchases!: MenuPurchase[];
}
