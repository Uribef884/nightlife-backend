import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Club } from './Club';
import { MenuItemVariant } from './MenuItemVariant';
import { MenuCategory } from './MenuCategory';

@Entity()
export class MenuItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  imageUrl?: string;

  @Column({ type: 'decimal', nullable: true })
  price?: number; // optional if hasVariants is true

  @Column({ default: false })
  dynamicPricingEnabled!: boolean;

  @ManyToOne(() => Club, (club) => club.menuItems)
  club!: Club;
  
  @Column()
  clubId!: string;

  @Column()
  categoryId!: string;
  
  @Column("int")
  maxPerPerson!: number;

  @ManyToOne(() => MenuCategory, (category) => category.items)
  category!: MenuCategory;

  @Column({ default: false })
  hasVariants!: boolean;

  @OneToMany(() => MenuItemVariant, (variant) => variant.menuItem)
  variants!: MenuItemVariant[];

  @Column({ default: true })
  isActive!: boolean;
}
