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

  @Column({ nullable: true })
  imageBlurhash?: string;

  @Column({
    type: "numeric",
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value !== null ? parseFloat(value) : null),
    },
  })
  price?: number; // optional if hasVariants is true

  @Column({ default: true })
  dynamicPricingEnabled!: boolean;

  @ManyToOne(() => Club, (club) => club.menuItems)
  club!: Club;
  
  @Column()
  clubId!: string;

  @Column()
  categoryId!: string;
  
  @Column("int", { nullable: true })
  maxPerPerson?: number;

  @ManyToOne(() => MenuCategory, (category) => category.items)
  category!: MenuCategory;

  @Column({ default: false })
  hasVariants!: boolean;

  @OneToMany(() => MenuItemVariant, (variant) => variant.menuItem)
  variants!: MenuItemVariant[];

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isDeleted!: boolean;

  @Column({ type: "timestamp", nullable: true })
  deletedAt?: Date;
}
