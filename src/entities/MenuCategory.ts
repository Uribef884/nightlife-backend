import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Club } from './Club';
import { MenuItem } from './MenuItem';

@Entity()
export class MenuCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column()
  clubId!: string;

  @ManyToOne(() => Club, (club) => club.menuCategories)
  club!: Club;

  @OneToMany(() => MenuItem, (item) => item.category)
  items!: MenuItem[];

  @Column({ default: true })
  isActive!: boolean;
}