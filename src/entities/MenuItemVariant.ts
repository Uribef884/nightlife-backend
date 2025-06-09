import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { MenuItem } from './MenuItem';

@Entity()
export class MenuItemVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string; // e.g., "Trago", "Botella"

  @Column('decimal')
  price!: number;
  
  @Column({ default: false })
  dynamicPricingEnabled!: boolean;

  @Column()
  menuItemId!: string;

  @ManyToOne(() => MenuItem, (item) => item.variants)
  menuItem!: MenuItem;
}