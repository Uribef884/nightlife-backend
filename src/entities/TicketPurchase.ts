import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
  } from "typeorm";
  import { Ticket } from "./Ticket";
  
  @Entity()
  export class TicketPurchase {
    @PrimaryGeneratedColumn("uuid")
    id!: string;
  
    @ManyToOne(() => Ticket)
    ticket!: Ticket;
  
    @Column()
    date!: string; // e.g. 2025-05-10 — day the ticket is valid for
  
    @Column({ nullable: true })
    buyerName?: string; // optional per ticket
  
    @Column({ nullable: true })
    buyerIdNumber?: string; // optional per ticket
  
    @Column()
    qrCodeEncrypted!: string; // AES encrypted string
  
    @Column({ default: false })
    isUsed!: boolean;
  
    @Column({ type: "timestamp", nullable: true })
    usedAt?: Date;
  
    @CreateDateColumn()
    createdAt!: Date;
  
    @UpdateDateColumn()
    updatedAt!: Date;
  }
  