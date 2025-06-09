import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { MenuItem } from './MenuItem';
import { MenuItemVariant } from './MenuItemVariant';
import { MenuPurchaseTransaction } from './MenuPurchaseTransaction';
import { User } from "./User";

@Entity()
export class MenuPurchase {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user?: User;

  @Column()
  menuItemId!: string;

  @ManyToOne(() => MenuItem)
  menuItem!: MenuItem;

  @Column({ nullable: true })
  variantId?: string;

  @ManyToOne(() => MenuItemVariant, { nullable: true })
  variant?: MenuItemVariant;

  @Column('int')
  quantity!: number;

  @Column('decimal')
  pricePerUnit!: number;

  @Column()
  clubId!: string;

  @Column('decimal')
  clubReceives!: number;

  @Column('decimal')
  platformReceives!: number;

  @Column('decimal', { default: 0 })
  platformFeeApplied!: number;

  @Column()
  purchaseTransactionId!: string;

  @ManyToOne(() => MenuPurchaseTransaction, (tx) => tx.purchases)
  transaction!: MenuPurchaseTransaction;
}