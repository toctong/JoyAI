import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from "typeorm";
import { newId } from "../id";
import { UtcCreateDateColumn, UtcUpdateDateColumn } from "../utc-date-columns";

/** TTS 音色库条目（后台内容 · 音色库） */
@Entity("tts_voice")
@Index("IDX_tts_voice_enabled_sort", ["enabled", "sortOrder"])
@Index("IDX_tts_voice_provider", ["provider", "sortOrder"])
@Index("IDX_tts_voice_category", ["category", "sortOrder"])
export class TtsVoice {
  @PrimaryColumn("varchar")
  id!: string;

  @Column({ unique: true, length: 64 })
  slug!: string;

  @Column({ type: "varchar", length: 80 })
  label!: string;

  /** 调用 TTS 时传入的 voice / speaker id */
  @Column({ type: "varchar", length: 128 })
  voiceId!: string;

  /**
   * 绑定渠道（优先）；用于展示与挑音频模型。
   * 空则回退到 provider 协议族匹配。
   */
  @Index()
  @Column({ type: "varchar", length: 64, nullable: true })
  channelId!: string | null;

  /**
   * 协议族：openai | dashscope | volcengine（由渠道 platform 推导，供适配器匹配）
   */
  @Column({ type: "varchar", length: 32, default: "openai" })
  provider!: string;

  @Column({ type: "varchar", length: 16, nullable: true })
  gender!: string | null;

  @Column({ type: "varchar", length: 32, nullable: true })
  language!: string | null;

  @Column({ type: "varchar", length: 64, default: "通用" })
  category!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  description!: string | null;

  /** 生成试听时用的默认台词 */
  @Column({ type: "varchar", length: 500, nullable: true })
  sampleText!: string | null;

  @Column({ type: "varchar", length: 1024, nullable: true })
  previewAudioUrl!: string | null;

  @Column({ default: true })
  enabled!: boolean;

  /** 内置种子；可改不可删（服务层约束） */
  @Column({ default: false })
  builtin!: boolean;

  @Column({ type: "int", default: 0 })
  sortOrder!: number;

  @UtcCreateDateColumn()
  createdAt!: Date;

  @UtcUpdateDateColumn()
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = newId();
  }
}
