import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { MenuItem } from './MenuItem';
import { MenuItemVariant } from './MenuItemVariant';

@Entity()
export class MenuCartItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: "varchar", nullable: true, default: null })
  userId!: string | null;

  @Column({ type: "varchar", nullable: true, default: null })
  sessionId!: string | null;

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

  @Column()
  clubId!: string; // for consistency enforcement

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
